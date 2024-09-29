// index.js

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const httpStatus = require("http-status");
const { MongoClient, ServerApiVersion } = require("mongodb");
const Joi = require("joi");
const winston = require("winston");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Logger setup using winston
const logger = winston.createLogger({
  level: "error",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log" }),
    new winston.transports.Console(),
  ],
});

// Middleware
app.use(cors());
app.use(express.json()); // Parse JSON requests

// MongoDB client setup
const uri = process.env.MONGODB_URI || "your_mongo_uri_here";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const userCollection = client.db("allrooftakeoffs").collection("Users");

// Input validation schema using Joi
const userSchema = Joi.object({
  username: Joi.string().min(3).required(),
  password: Joi.string().min(6).required(),
});

// Error handling middleware for async functions
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Async MongoDB connection
async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Successfully connected to MongoDB!");

    /**
     * =========================
     *         JWT
     * =========================
     */

    /**
     * =========================
     *      MIDDELWARES
     * =========================
     */
    /**
     * ==================================================
     *                       USERS
     * ==================================================
     */

    // User registration route
    app.post(
      "/register",
      asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        // Validate email and password
        const { error } = userSchema.validate({ username: email, password });
        if (error) {
          return res
            .status(httpStatus.BAD_REQUEST)
            .json({ message: error.details[0].message });
        }

        // Check if the user already exists
        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
          return res
            .status(httpStatus.CONFLICT)
            .json({ message: "User already exists" });
        }

        // Hash the password before saving to the database
        const hashedPassword = await bcrypt.hash(
          password,
          process.env.BCRYPT_SOLT_ROUND
        );

        // Save the new user to the database
        const newUser = { email, password: hashedPassword };
        await userCollection.insertOne(newUser);

        res
          .status(httpStatus.CREATED)
          .json({ message: "User registered successfully" });
      })
    );

    // Login route
    app.post(
      "/login",
      asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        // Find user by email
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res
            .status(httpStatus.UNAUTHORIZED)
            .json({ message: "Invalid email or password" });
        }

        // Compare the provided password with the stored hashed password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res
            .status(httpStatus.UNAUTHORIZED)
            .json({ message: "Invalid email or password" });
        }

        // Generate a JWT token
        const token = jwt.sign(
          { userId: user._id, email: user.email },
          JWT_SECRET,
          {
            expiresIn: "1h", // Token expires in 1 hour
          }
        );

        res.status(httpStatus.OK).json({
          message: "Login successful",
          token,
        });
      })
    );

    /**
     * =========================
     *      PROJECTS
     * =========================
     */
  } catch (err) {
    logger.error("MongoDB connection error: " + err);
    process.exit(1); // Exit if MongoDB connection fails
  }
}
run().catch(console.dir);

// Route to create a new user (with validation)
// app.post(
//   "/users",
//   asyncHandler(async (req, res) => {
//     const { error } = userSchema.validate(req.body);
//     if (error) {
//       return res.status(400).json({ message: error.details[0].message });
//     }

//     const { username, password } = req.body;
//     const newUser = { username, password };

//     await userCollection.insertOne(newUser);
//     res
//       .status(httpStatus.CREATED)
//       .json({ message: "User created successfully" });
//   })
// );

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

// 404 Error Handling (Route not found)
app.use((req, res, next) => {
  res.status(httpStatus.NOT_FOUND).json({ message: "Route not found" });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  logger.error(err.message); // Log the error for debugging
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// Server listening
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown on unhandled errors
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception: " + err);
  process.exit(1); // Exit the process to avoid an unstable state
});

process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Rejection: " + err);
  process.exit(1); // Exit the process to avoid an unstable state
});
