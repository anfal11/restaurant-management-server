const express = require('express')
const app = express()
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

//mongodb connection


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ey8cr7h.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();


    const userCollection = client.db("restaurantDB").collection("users");
    const menuCollection = client.db("restaurantDB").collection("menu");
    const reviewCollection = client.db("restaurantDB").collection("reviews");
    const cartCollection = client.db("restaurantDB").collection("cart");
    const paymentCollection = client.db("restaurantDB").collection("payment");

    //JWT related API
    app.post("/api/v1/jwt", async (req, res) => {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET,
           { expiresIn: '1h' });
           res.send({ token: token});
    })

    //middlewares / verify token
    const verifyToken = (req, res, next) => {
      console.log(req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({message: 'Unauthorized request'})
        
      }
      const token = req.headers.authorization.split(' ')[1];
      
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET , function(err, decoded) {
        if (err) {
          return res.status(401).send({message: 'Unauthorized request'})
        }
        req.user = decoded;
      });     
      next();
    }

    //use verify admin after verify token
    const verifyAdmin = async(req, res, next) => {
     const email = req.user.email;
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if(!isAdmin){
        return res.status(403).send({message: 'Forbidden Access'})
      }
      next();
    }

    //user related api
    app.get('/api/v1/users', verifyToken, verifyAdmin, async(req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.get('/api/v1/users/admin/:email', verifyToken, async(req, res) => {
      console.log(83, req.params, req?.decoded?.email);
      const email = req?.params?.email;
      if (email !== req?.user?.email) {
        return res.status(403).send({message: 'Unauthorized request'})
      }
      const query = {email: email};
      const user = await userCollection.findOne(query);
      let admin = false;
      if(user){
        admin = user?.role === 'admin';
      }
      res.send({admin});
    })

    app.post('/api/v1/users', async(req, res) => {
      const query = {email: req.body.email};
      const existingUser = await userCollection.findOne(query);
    
      if(existingUser){
        res.send({message: 'User already exists', insertedId: null});
      } else {
        const result = await userCollection.insertOne(req.body);
        res.send(result);
      }
    })

    app.patch('/api/v1/users/admin/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {$set: {role: 'admin'}};
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    
    app.delete('/api/v1/users/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

//menu related apis
    app.get('/api/v1/menu', async(req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    })

    app.get('/api/v1/menu/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await menuCollection.findOne(query);
      res.send(result);
    })

    app.post('/api/v1/menu', verifyToken, verifyAdmin, async(req, res)=>{
      const result = await menuCollection.insertOne(req.body);
      res.send(result);
    })

    app.patch('/api/v1/menu/:id', async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {$set: req.body};
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.delete('/api/v1/menu/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })

    app.get('/api/v1/reviews', async(req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })

    // carts collection
    app.get('/api/v1/cart', async(req, res) => {
      const email = req.query.email;
      if(!email){
        return res.send({message: 'Email is required'})
      }
      const query = {email: email};
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/api/v1/cart', async(req, res) => {
      const result = await cartCollection.insertOne(req.body);
      res.send(result);
    })

    app.delete('/api/v1/cart/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })



    //payment intend
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;    
      const amount = parseInt(price * 100);
 
    
      if (amount < 1) {
        return res.status(400).send({ error: 'Invalid amount' });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: [
          "card"
        ],
      });
    
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get('/api/v1/payments/:email', verifyToken, async(req, res) => {
      const query = { email: req.query.email };
      if (req.params.email !== req?.user?.email) {
        return res.status(403).send({message: 'Unauthorized request'})
      }
      const result = await paymentCollection.find().toArray();
      res.send(result);
    })

    app.post('/api/v1/payments', async (req, res) => {
      let deleteResult;  // Declare deleteResult outside the try-catch block
    
      try {
        const result = await paymentCollection.insertOne(req.body);
    
        const query = {
          _id: {
            $in: req.body.cartIds.map(id => new ObjectId(id))
          }
        };
    
        deleteResult = await cartCollection.deleteMany(query);
    
        console.log('Deleted cart items:', deleteResult);
    
        res.send({ result, deleteResult });
      } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });
    
    
    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);





app.get('/', (req, res) => {
  res.send('Restaurant management is running.....')
})

app.listen(port, () => {
  console.log(`Restaurant is running on port ${port}`)
})