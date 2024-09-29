# All Roof Takeoffs Server

This is the backend server for the **All Roof Takeoffs** project. It is built using **Node.js**, **Express.js**, and **MongoDB** to manage user data and provide API endpoints for client interactions.

## Technologies Used

- **Node.js**
- **Express.js**
- **MongoDB**
- **Nodemon** (for development)
- **dotenv** (for environment variables)
- **http-status** (for HTTP status codes)
- **cors** (for Cross-Origin Resource Sharing)
- **jsonwebtoken** (for token-based authentication)
- **joi** (for data validation)
- **winston** (for logging)

## Installation and Setup

### Prerequisites

- [Node.js](https://nodejs.org/en/) installed
- [MongoDB](https://www.mongodb.com/) access (You can use MongoDB Atlas for a cloud database)

### Steps to Run the Server:

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   ```

# Step 2: Navigate to server directory

cd allrooftakeoffs-server

# Step 3: Install dependencies

npm install

# Step 4: Create .env file

# (You create this manually and add the lines below)

MONGODB_URI=mongodb+srv://username:password@cluster0.g5guy.mongodb.net/?retryWrites=true&w=majority
PORT=5000

# Step 5: Run the server

npm start

# Step 6: Open in browser

# Navigate to http://localhost:5000/
