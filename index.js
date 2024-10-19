// index.js

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const httpStatus = require("http-status");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const Joi = require("joi");
const winston = require("winston");

// google drive related
const fs = require("fs");
const { google } = require("googleapis");
const apikeys = require("./apikeys.json");
const SCOPE = ["https://www.googleapis.com/auth/drive"];

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json()); // Parse JSON requests

// MongoDB client setup
// const uri = process.env.MONGODB_URI;
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

// Error handling middleware for async functions

// Async MongoDB connection
async function run() {
  try {
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
    /**
     * =========================
     *      MIDDELWARES
     * =========================
     */

    const authenticateToken = (role) => {
      console.log(role);

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

          console.log("for varify", decoded);
          const { email } = decoded;
          const user = await userCollection.findOne({ email });

          if (!user) {
            return res
              .status(httpStatus.FORBIDDEN)
              .json({ message: "Invalid or expired token" });
          }
          if (!(user.role === role)) {
            return res
              .status(httpStatus.FORBIDDEN)
              .json({ message: "Invalid or expired token" });
          }

          next();
        });

        // console.log("log user form middleware", user);
      };
    };

    // A Function that can provide access to google drive api
    async function authorize() {
      const jwtClient = new google.auth.JWT(
        apikeys.client_email,
        null,
        apikeys.private_key,
        SCOPE
      );
      await jwtClient.authorize();
      return jwtClient;
    }

    // Helper function to upload a file to Google Drive
    async function uploadFileToDrive(auth, fileName, mimeType, fileBuffer) {
      const drive = google.drive({ version: "v3", auth });

      const fileStream = new stream.PassThrough();
      fileStream.end(fileBuffer);

      const response = await drive.files.create({
        resource: {
          name: fileName,
          mimeType: mimeType,
        },
        media: {
          mimeType: mimeType,
          body: fileStream,
        },
        fields: "id, webViewLink",
      });

      return response.data; // Returns the file ID and webViewLink
    }

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

        const user = { ...newUserData, isBlock: false, isDeleted: false };

        const createUser = await userCollection.insertOne(user);
        return res.json({
          success: true,
          status: httpStatus.OK,
          message: "All users retrive successfully",
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
          console.log("Password does not match");
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
      authenticateToken((role = "Admin")),
      async (req, res) => {
        try {
          let querys = {};
          const { serch } = req.query;

          if (serch) {
            querys = {
              $or: [
                ({ name: { $regex: serch, $options: "i" } },
                { email: { $regex: serch, $options: "i" } },
                { address: { $regex: serch, $options: "i" } },
                { phone: { $regex: serch, $options: "i" } }),
              ],
            };
          }
          const users = await userCollection
            .find(querys, { projection: { password: 0 } })
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

    app.post("/add-projects", async (req, res) => {
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
    });

    app.get("/get-projects", async (req, res) => {
      try {
        let querys = {};
        const { serch } = req.query;

        if (serch) {
          querys = {
            $or: [
              ({ name: { $regex: serch, $options: "i" } },
              { description: { $regex: serch, $options: "i" } },
              { country: { $regex: serch, $options: "i" } },
              { posting_date: { $regex: serch, $options: "i" } },
              { cost: { $regex: serch, $options: "i" } },
              { dateline: { $regex: serch, $options: "i" } },
              { summary: { $regex: serch, $options: "i" } }),
            ],
          };
        }

        const result = await porjectsCollection.find(querys).toArray();
        return res.json({
          success: true,
          status: httpStatus.OK,
          message: "All projects retrive successfully",
          data: result,
        });
      } catch (err) {}
    });

    app.get("/get-project/:id", async (req, res) => {
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

    app.patch("/upload-file/:id", async (req, res) => {
      try {
        const { id } = req.params; // Get the project ID from params
        const { fileName, mimeType, fileData } = req.body; // Expect file data from the request body

        // Step 1: Validate incoming file data
        if (!fileName || !mimeType || !fileData) {
          return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message:
              "File data is missing. Ensure you send fileName, mimeType, and fileData.",
          });
        }

        // Step 2: Convert base64 file data to a buffer
        const fileBuffer = Buffer.from(fileData, "base64");

        // Step 3: Authorize with Google Drive API
        const auth = await authorize();

        // Step 4: Upload the file to Google Drive
        const driveResponse = await uploadFileToDrive(
          auth,
          fileName,
          mimeType,
          fileBuffer
        );
        const fileLink = driveResponse.webViewLink; // Get the Google Drive file link

        // Step 5: Store file link in MongoDB
        const result = await projectsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { fileLink: fileLink } }
        );

        // Step 6: Send success response
        return res.json({
          success: true,
          status: httpStatus.OK,
          message: "File uploaded and link saved successfully",
          data: {
            fileLink,
            mongoUpdateResult: result,
          },
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
