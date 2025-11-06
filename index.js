import express from "express";
import dotenv from "dotenv";
import connection from "./connection.js";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post("api/purchases", (req,res) => {
    return
})