// index.js

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const httpStatus = require("http-status");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const multer = require("multer");

// google drive related
const fs = require("fs");
const { google } = require("googleapis");
const apikeys = require("./apikeys.json");
const { Readable } = require("stream");
const SCOPE = ["https://www.googleapis.com/auth/drive"];
const upload = multer();

dotenv.config();
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;
app.use(cors());

const allowedOrigins = [
  // "https://allrooftakeoffs-client.vercel.app",
  "https://www.allrooftakeoffs.com.au",
  "https://allrooftakeoffs.com.au",
  // "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps or CURL requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        // If origin is in the allowed list, allow it
        callback(null, true);
      } else {
        // If origin is not allowed, reject it
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

const uri =
  "mongodb+srv://ART-dev:ART-dev@artcluster0.8rabx.mongodb.net/?retryWrites=true&w=majority&appName=ARTCluster0";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const userCollection = client.db("ART").collection("Users");
const porjectsCollection = client.db("ART").collection("Projects");

let authClient;

// Function to authorize Google Drive API
// Function to authorize Google Drive API
async function authorize() {
  const jwtClient = new google.auth.JWT(
    apikeys.client_email,
    null,
    apikeys.private_key,
    SCOPE
    // {
    //   timeout: 30000, // Set timeout to 30 seconds (adjust as needed)
    // }
  );
  await jwtClient.authorize();
  return jwtClient;
}

async function run() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB!");

    /**
     * =========================
     *      MIDDELWARES
     * =========================
     */

    const authenticateToken = () => {
      return async (req, res, next) => {
        // Extract the Authorization header
        const authHeader = req.headers["authorization"];

        // Check if the Authorization header exists and starts with 'Bearer'
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res
            .status(httpStatus.UNAUTHORIZED)
            .json({ message: "Access denied, token missing!" });
        }

        // Get the token by removing the 'Bearer ' part
        const token = authHeader.split(" ")[1];

        // Verify the token
        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
          if (err) {
            return res
              .status(httpStatus.FORBIDDEN)
              .json({ message: "Invalid or expired token" });
          }

          const { email } = decoded;
          const user = await userCollection.findOne({ email });

          if (!user) {
            return res
              .status(httpStatus.FORBIDDEN)
              .json({ message: "Invalid or expired token" });
          }

          next();
        });

        // console.log("log user form middleware", user);
      };
    };

    const authenticateAdmin = () => {
      return async (req, res, next) => {
        // Extract the Authorization header
        const authHeader = req.headers["authorization"];

        // Check if the Authorization header exists and starts with 'Bearer'
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res
            .status(httpStatus.UNAUTHORIZED)
            .json({ message: "Access denied, token missing!" });
        }

        // Get the token by removing the 'Bearer ' part
        const token = authHeader.split(" ")[1];

        // Verify the token
        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
          if (err) {
            return res
              .status(httpStatus.FORBIDDEN)
              .json({ message: "Invalid or expired token" });
          }

          const { email } = decoded;
          const user = await userCollection.findOne({ email });

          if (!user) {
            return res
              .status(httpStatus.FORBIDDEN)
              .json({ message: "Invalid or expired token" });
          }

          // Check if the user has an admin role
          if (user.role !== "Admin") {
            return res
              .status(httpStatus.FORBIDDEN)
              .json({ message: "Access denied, admin privileges required" });
          }

          // User is authenticated and has admin role
          next();
        });
      };
    };

    /**
     * ==================================================
     *                       USERS
     * ==================================================
     */

    app.post("/register", async (req, res) => {
      const newUserData = req.body;

      try {
        const email = newUserData?.email;
        const validateEmail = (email) => {
          const emailPattern =
            /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
          return emailPattern.test(email);
        };
        if (!validateEmail(email)) {
          throw new Error("Give me valid email");
        }

        newUserData.password = await bcrypt.hash(
          newUserData.password,
          Number(process.env.BCRYPT_SOLT_ROUND)
        );

        const isEmailIsAxist = await userCollection.findOne({ email: email });
        if (isEmailIsAxist) {
          throw new Error("This email is already exist");
        }

        const user = {
          ...newUserData,
          roue: "User",
          isBlock: false,
          isDeleted: false,
        };

        const createUser = await userCollection.insertOne(user);
        return res.json({
          success: true,
          status: httpStatus.OK,
          message: "Registration successful",
          data: createUser,
        });
      } catch (err) {
        return res.json({
          success: false,
          status: httpStatus.BAD_REQUEST,
          message: err?.message || "Someting went wrong",
          data: err,
        });
      }
    });

    app.post("/login", async (req, res) => {
      try {
        const { email, password } = req.body;

        const user = await userCollection.findOne({ email });
        if (!user) {
          throw new Error("Invalid identity");
        }

        if (user.isDeleted) {
          throw new Error("User is deleted");
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
          throw new Error("Invalid email or password");
        }

        const token = jwt.sign(
          { userId: user._id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_SECRET_EXPAIR_IN }
        );

        user.password = "";
        return res.json({
          success: true,
          status: httpStatus.OK,
          message: "User retrieved successfully",
          data: { user, token },
        });
      } catch (err) {
        return res.status(httpStatus.FAILED_DEPENDENCY).json({
          success: false,
          message: "Login failed",
          error: err.message,
        });
      }
    });

    app.get(
      "/get-users",
      authenticateToken(),
      authenticateAdmin(),
      async (req, res) => {
        try {
          let query = {};
          const { search, recent } = req.query;

          // Search filter
          if (search) {
            query = {
              $or: [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { address: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
              ],
            };
          }

          // Recent users filter
          if (recent === "true") {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            query.createdAt = { $gte: oneWeekAgo };
          }

          const users = await userCollection
            .find(query, { projection: { password: 0 } })
            .toArray();
          res.json({
            success: true,
            status: httpStatus.OK,
            message: "All users retrieved successfully",
            data: users,
          });
        } catch (err) {
          res.status(500).json({
            success: false,
            status: httpStatus.INTERNAL_SERVER_ERROR,
            message: err.message || "Something went wrong",
            data: err,
          });
        }
      }
    );

    app.get(
      "/get-userData",
      authenticateToken(),
      authenticateAdmin(),
      async (req, res) => {
        try {
          const users = await userCollection
            .find({}, { projection: { _id: 1, name: 1, image: 1 } })
            .toArray();

          return res.json({
            success: true,
            status: httpStatus.OK,
            message: "All users retrieved successfully",
            data: users,
          });
        } catch (err) {
          return res.json({
            success: true,
            status: httpStatus.OK,
            message: err.message || "Someting went wrong",
            data: err,
          });
        }
      }
    );

    /**
     * ==================================================
     *                       PROJECTS
     * ==================================================
     */

    app.post(
      "/add-projects",
      authenticateToken(),
      authenticateAdmin(),
      async (req, res) => {
        try {
          const projects = req.body;

          const result = await porjectsCollection.insertMany(projects);

          return res.json({
            success: true,
            status: httpStatus.OK,
            message: "All porjects added successfully",
            data: result,
          });
        } catch (err) {
          return res.json({
            success: false,
            status: httpStatus.NO_CONTENT,
            message: "Porjects added failed",
            data: err,
          });
        }
      }
    );

    app.post("/addProject", authenticateToken(), async (req, res) => {
      const project = req.body;
      try {
        if (!project) {
          return { message: "project is empty" };
        }

        const result = await porjectsCollection.insertOne(project);

        return res.json({
          success: true,
          status: httpStatus.OK,
          message: "Porject added successfully",
          data: result,
        });
      } catch (err) {
        return err;
      }
    });

    app.get("/get-projects", authenticateToken(), async (req, res) => {
      try {
        const { search, startDate } = req.query;
        let query = {};

        if (search) {
          query = {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
              { location: { $regex: search, $options: "i" } },
              { posting_date: { $regex: search, $options: "i" } },
              { cost: { $regex: search, $options: "i" } },
              { dateline: { $regex: search, $options: "i" } },
              { summary: { $regex: search, $options: "i" } },
            ],
          };
        }

        if (startDate) {
          query.posting_date = { $gte: new Date(startDate) };
        }

        const result = await porjectsCollection.find(query).toArray();
        return res.json({
          success: true,
          status: httpStatus.OK,
          message: "Projects retrieved successfully",
          data: result,
        });
      } catch (err) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Failed to retrieve projects",
          error: err.message,
        });
      }
    });

    app.get("/get-project/:id", authenticateToken(), async (req, res) => {
      try {
        const { id } = req.params; // Extract project ID from request parameters

        // Check if the ID is a valid MongoDB ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: "Invalid project ID format",
          });
        }

        // Fetch the project by ID from the projects collection
        const project = await porjectsCollection.findOne({
          _id: new ObjectId(id),
        });

        // If no project is found, return an error
        if (!project) {
          return res.status(httpStatus.NOT_FOUND).json({
            success: false,
            message: "Project not found",
          });
        }

        // Return the project details
        return res.json({
          success: true,
          status: httpStatus.OK,
          message: "Project retrieved successfully",
          data: project,
        });
      } catch (err) {
        // Handle server errors
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Something went wrong",
          error: err.message,
        });
      }
    });

    app.get(
      "/get-projects/:assignedId",
      // authenticateToken(),
      async (req, res) => {
        try {
          const { assignedId } = req.params; // Extract assigned ID from request parameters

          // Use MongoDB's find() with a query on assignedOn._id
          const projects = await porjectsCollection
            .find({ "assignedOn._id": assignedId })
            .toArray();

          // Return the project details
          return res.json({
            success: true,
            status: 200,
            message: "Projects retrieved successfully",
            data: projects,
          });
        } catch (err) {
          // Handle server errors
          return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message,
          });
        }
      }
    );

    app.post(
      "/upload-file/:id",
      authenticateToken(),
      authenticateAdmin(),
      upload.single("file"),
      async (req, res) => {
        authClient = await authorize(); // Authorize once at startup

        if (!authClient) {
          return res
            .status(500)
            .json({ error: "Google Drive authorization failed." });
        }
        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded." });
        }

        const drive = google.drive({ version: "v3", auth: authClient });
        const fileStream = new Readable();
        fileStream.push(req.file.buffer);
        fileStream.push(null);

        const fileMetaData = {
          name: req.file.originalname || "file",
          parents: ["1yUGf8duNukcIgv0SuYqz0QhKdjkSxrbE"],
        };

        const uploadResponse = await drive.files.create({
          resource: fileMetaData,
          media: {
            body: fileStream,
            mimeType: req.file.mimetype,
          },
          fields: "id",
        });

        const fileId = uploadResponse.data.id;
        const fileName = req.file.originalname;

        await drive.permissions.create({
          fileId,
          requestBody: {
            role: "reader",
            type: "anyone",
          },
        });

        const file = await drive.files.get({
          fileId,
          fields: "webViewLink, webContentLink",
        });

        console.log({
          id: req.params.id,
          fileName: fileName,
          webViewLink: file.data.webViewLink,
          downloadableLink: file.data.webContentLink,
        });

        const result = await porjectsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          {
            $push: {
              files: {
                fileName: fileName,
                webViewLink: file.data.webViewLink,
                downloadableLink: file.data.webContentLink,
              },
            },
          }
        );

        // Return the project details
        return res.json({
          success: true,
          status: httpStatus.OK,
          message: "File uploaded successfully!",
          data: result,
        });
      }
    );

    app.patch(
      "/asignUser/:projectId",
      authenticateToken(),
      authenticateAdmin(),
      async (req, res) => {
        try {
          const { projectId } = req.params;
          const assignedOn = req.body;

          if (!ObjectId.isValid(projectId)) {
            return res.status(httpStatus.BAD_REQUEST).json({
              success: false,
              message: "Invalid project ID format",
            });
          }

          const project = await porjectsCollection.findOne({
            _id: new ObjectId(projectId),
          });
          if (!project) {
            return res.status(httpStatus.NOT_FOUND).json({
              success: false,
              message: "Project not found",
            });
          }

          // Perform the update
          const updatedProject = await porjectsCollection.updateOne(
            { _id: new ObjectId(projectId) },
            { $set: { assignedOn } }
          );

          if (updatedProject.modifiedCount === 0) {
            return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
              success: false,
              message: "Failed to assign user to the project",
            });
          }

          return res.status(httpStatus.OK).json({
            success: true,
            message: "User assigned to project successfully",
          });
        } catch (err) {
          return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: err.message || "Something went wrong",
          });
        }
      }
    );

    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Successfully connected to MongoDB!");
  } catch (err) {
    // logger.error("MongoDB connection error: " + err);
    console.log(err);

    process.exit(1); // Exit if MongoDB connection fails
  }
}
run().catch(console.dir);

// Basic route
app.get("/", (req, res) => {
  const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Server Status</title>
          <style>
            body {
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              background-color: #f0f0f0;
              margin: 0;
              font-family: Arial, sans-serif;
            }
            .container {
              text-align: center;
              background-color: #fff;
              padding: 50px;
              border-radius: 10px;
              box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }
            h1 {
              color: #4caf50;
              font-size: 2.5em;
            }
            p {
              color: #333;
              font-size: 1.2em;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Your server is running perfectly</h1>
            <p>Everything is working as expected!</p>
          </div>
        </body>
      </html>
    `;
  res.status(httpStatus.OK).send(html);
});

// Server listening
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
