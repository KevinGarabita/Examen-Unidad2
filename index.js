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

    if(details.length == 0){
        return res.status(400).json({message: "Debe de haber almenos un producto"})
    }

    if(details.length > 5){
        return res.status(400).json({message: "no puede haber mas de 5 productos"})
    }

    
    try{
        await connection.beginTransaction()

        const[resultPurchase] = await connection.query("INSERT INTO purchases (user_id, total, status) VALUES (?, 0, ?)",
            [user_id,status]
        )

        const purchase_id = resultPurchase.insertId
        let total = 0;
            for(const detail of details) {

                const {product_id, quantity, price} = detail;

                if(!product_id || !quantity || !price){
                    return res.status(400).json({message: "Faltan campos por llenar"});
                }

                const [rows] = await connection.query("SELECT * FROM products WHERE id = ?",[product_id]);
                if(rows.length == 0) {
                return res.status(404).json({message: "no se encontró el producto"});
                }

                const producto = rows[0];

                if(producto.stock < quantity){
                    return res.status(409).json({message: "no hay stock suficiente del producto " + product_id});
                }
                const subtotal = price * quantity
                await connection.query("INSERT INTO purchase_details (purchase_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)",
                    [purchase_id,product_id,quantity,price,subtotal]
                );

                await connection.query("UPDATE products SET stock = stock - ? WHERE id = ?", 
                    [quantity,product_id]
                );
                total = total + price * quantity;
                if(total > 3500){
                    return res.status(409).json({message: "el total de la compra sobrepaso 3500"})
                }
            }
        
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

app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});
