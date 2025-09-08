const express = require('express');
const app = express();
const port = 3000;

// Middleware
app.use(express.json());

// In-memory storage for enodes
let enodes = [];

// Authentication token - Updated for private network
const ACCESS_TOKEN = 'private-network-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
console.log('New Access Token:', ACCESS_TOKEN);

// Middleware to check authorization
function authenticate(req, res, next) {
  const token = req.headers.authorization;
  if (token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST endpoint to add enode
app.post('/post-enode', authenticate, (req, res) => {
  const { enode } = req.body;
  
  if (!enode) {
    return res.status(400).json({ error: 'Enode is required' });
  }

  // Add enode if not already present
  if (!enodes.includes(enode)) {
    enodes.push(enode);
    console.log(`Added enode: ${enode}`);
  }

  res.json({ success: true, message: 'Enode added successfully' });
});

// GET endpoint to retrieve all enodes
app.get('/get-enode', authenticate, (req, res) => {
  res.json(enodes);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    enodeCount: enodes.length,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Enode API server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});

// Cleanup old enodes every 5 minutes
setInterval(() => {
  console.log(`Current enodes: ${enodes.length}`);
  // Keep only the last 10 enodes to prevent memory buildup
  if (enodes.length > 10) {
    enodes = enodes.slice(-10);
    console.log(`Cleaned up enodes, now have: ${enodes.length}`);
  }
}, 300000);
