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
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

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
async function authorize() {
  const jwtClient = new google.auth.JWT(
    apikeys.client_email,
    null,
    apikeys.private_key,
    SCOPE,
    { timeout: 10000 }
  );
  await jwtClient.authorize();
  return jwtClient;
}

async function run() {
  try {
    authClient = await authorize(); // Authorize once at startup
    await client.connect();
    console.log("Successfully connected to MongoDB!");

    /**
     * =========================
     *      MIDDELWARES
     * =========================
     */

    const authenticateToken = (role) => {
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

          // if (serch) {
          //   querys = serch;
          // }
          // console.log(querys);
          console.log(serch);

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
          console.log(querys);

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

    app.post("/addProject", async (req, res) => {
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

    app.get("/get-projects", async (req, res) => {
      try {
        let querys = {};
        const serch = req.query;

        if (serch) {
          querys = serch;
        }

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

        const result = await porjectsCollection.find().toArray();
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

    // app.patch("/upload-file/:id", async (req, res) => {
    //   try {
    //     const { id } = req.params;
    //     const { file } = req.body;
    //     console.log("hit on uploade file", file);

    //     if (!fileData) {
    //       return res.status(400).json({
    //         success: false,
    //         message: "No file data provided.",
    //       });
    //     }

    //     // Convert the base64 file data to a buffer
    //     const fileBuffer = Buffer.from(fileData, "base64");

    //     // Google Drive Authorization
    //     const auth = await authorize(); // Make sure to implement the authorize function

    //     // Upload file to Google Drive
    //     const driveResponse = await uploadFileInChunks(
    //       auth,
    //       fileName,
    //       mimeType,
    //       fileBuffer
    //     );

    //     // Get the webViewLink
    //     const fileLink = driveResponse.webViewLink;

    //     // Update the MongoDB with the file link
    //     const result = await porjectsCollection.updateOne(
    //       { _id: new ObjectId(id) },
    //       { $set: { fileLink: fileLink } }
    //     );

    //     return res.status(200).json({
    //       success: true,
    //       message: "File uploaded and link saved successfully",
    //       data: {
    //         fileLink,
    //         mongoUpdateResult: result,
    //       },
    //     });
    //   } catch (err) {
    //     return res.status(500).json({
    //       success: false,
    //       message: "An error occurred during file upload",
    //       error: err.message,
    //     });
    //   }
    // });

    // API endpoint for file upload

    // Update the app.patch for handling file uploads
    // app.patch("/upload-file/:id", upload.single("file"), async (req, res) => {
    //   try {
    //     const { id } = req.params;

    //     // Check if a file was uploaded
    //     if (!req.file) {
    //       return res.status(400).json({
    //         success: false,
    //         message: "No file uploaded.",
    //       });
    //     }

    //     console.log(req.file);

    //     const fileName = req.file.originalname; // Get the original file name
    //     const mimeType = req.file.mimetype; // Get the MIME type of the file
    //     const fileBuffer = req.file.buffer; // Get the file buffer from Multer

    //     // Google Drive Authorization
    //     const auth = await authorize(); // Make sure to implement the authorize function

    //     // Upload file to Google Drive
    //     const driveResponse = await uploadFileInChunks(
    //       auth,
    //       fileName,
    //       mimeType,
    //       fileBuffer
    //     );

    //     // Get the webViewLink
    //     const fileLink = driveResponse.webViewLink;

    //     console.log(fileLink);

    //     // Update the MongoDB with the file link
    //     const result = await porjectsCollection.updateOne(
    //       { _id: new ObjectId(id) },
    //       { $set: { fileLink: fileLink } }
    //     );

    //     return res.status(200).json({
    //       success: true,
    //       message: "File uploaded and link saved successfully",
    //       data: {
    //         fileLink,
    //         mongoUpdateResult: result,
    //       },
    //     });
    //   } catch (err) {
    //     return res.status(500).json({
    //       success: false,
    //       message: "An error occurred during file upload",
    //       error: err.message,
    //     });
    //   }
    // });

    app.post("/upload-file/:id", upload.single("file"), async (req, res) => {
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
      const fileName = uploadResponse.data.name;

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
