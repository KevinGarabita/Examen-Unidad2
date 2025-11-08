import express from "express";
import dotenv from "dotenv";
import connection from "./connection.js";

dotenv.config();
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post("/api/purchases", async (req,res) => {
    const {user_id, status, details} = req.body;

    if(!user_id || !status || !details){
        return res.status(400).json({message: "Faltan campos por llenar"});
    }
    
    const total = await validarInformacion(details, connection)

    try{
        await connection.beginTransaction();

        const[resultPurchase] = await connection.query("INSERT INTO purchases (user_id, total, status) VALUES (?, 0, ?)",
        [user_id,status]
        );

        const purchase_id = resultPurchase.insertId
        
        await ModificarDetails(details,connection, purchase_id)

        const purchase_date = new Date();

        await connection.query("UPDATE purchases SET total = ?, purchase_date = ? WHERE id = ?",
            [total,purchase_date,purchase_id]
        );

        await connection.commit();

        res.status(201).json({message:"compra creada con exito", id: purchase_id, Total: total})

    } catch(err){
        await connection.rollback();
        res.status(500).json({error: "Error al crear la compra", detalle: err.message})
    }
})

app.put("/api/purchases/:id", async (req, res) => {

    console.log("BODY:", req.body);
    const {id} = req.params;
    const {user_id,status, details} = req.body || {};

    if (details && !Array.isArray(details)) {
        return res.status(400).json({ message: "details debe ser un array" });
    }

    const [resultPurchase] = await connection.query(
        "SELECT * FROM purchases WHERE id = ?",
        [id]
    );

    if(resultPurchase.length === 0){
        return res.status(404).json({message: "No se encontro la compra"})
    }

    const purchase = resultPurchase [0];

    if(purchase.status === "COMPLETED"){
        return res.status(409).json({message: "la compra ya esta en COMPLETED"})
    }

    let updates = [];
    let values = [];

    if(user_id !== undefined){
        updates.push("user_id = ?");
        values.push(user_id);
    }
    if(status !== undefined){
        updates.push("status = ?");
        values.push(status);
    }

    const purchase_date = new Date();
    updates.push("purchase_date = ?");
    values.push(purchase_date);

    let total = 0
    if(details){
        updates.push("total = ?")
        total = await validarInformacion(details,connection);
        values.push(total)
    }

    try{
        await connection.beginTransaction();

        if(updates.length > 0){
            const sql = `UPDATE purchases SET ${updates.join(", ")} WHERE id = ?`;
            values.push(id);
            await connection.query(sql,values);
        }
        let oldDetails = [];
        if (details) {
            [oldDetails] = await connection.query(
                "SELECT * FROM purchase_details WHERE purchase_id = ?",
                [id]
            );
        }

        for (const detail of oldDetails){
            await connection.query(
                "UPDATE products SET stock = stock + ? WHERE id = ?",
                [detail.quantity, detail.product_id]
            );
        }

        await connection.query("DELETE FROM purchase_details WHERE purchase_id = ?",
            [id]
        );

        await ModificarDetails(details,connection,id);

        await connection.commit();

        res.json({message: "Compra actualizada con exito", id, total});
    } catch (err){
        await connection.rollback();
        res.status(500).json({error: "No se puedo actualizar la compra", detalle: err.message})
    }
})


async function validarInformacion(details, connection) {
  let total = 0;

  if (!details || details.length === 0) {
    throw new Error("Debe haber al menos un producto");
  }

  if (details.length > 5) {
    throw new Error("No puede haber más de 5 productos");
  }

  for (const detail of details) {
    const { product_id, quantity, price } = detail;

    if (!product_id || !quantity || !price) {
      throw new Error("Faltan campos por llenar");
    }

    const [rows] = await connection.query("SELECT * FROM products WHERE id = ?", [product_id]);
    if (rows.length === 0) {
      throw new Error(`No se encontró el producto ${product_id}`);
    }

    const producto = rows[0];

    if (producto.stock < quantity) {
      throw new Error(`No hay stock suficiente del producto ${product_id}`);
    }

    total += price * quantity;

    if (total > 3500) {
      throw new Error("El total de la compra sobrepasa los $3500");
    }
  }

  return total;
}

async function ModificarDetails(details, connection, purchase_id){
    for(const detail of details){

        const {product_id, quantity, price} = detail;

        const subtotal = price * quantity

        await connection.query("INSERT INTO purchase_details (purchase_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)",
            [purchase_id,product_id,quantity,price,subtotal]
        );

        await connection.query("UPDATE products SET stock = stock - ? WHERE id = ?", 
            [quantity,product_id]
        );
    }
}

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
