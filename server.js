const express = require('express');
const path = require('path');
const app = express();

// Render assigns a dynamic PORT environment variable.
const PORT = process.env.PORT || 3000;

// Tell Express to serve any static files (like CSS, JS, or images if you add them later)
app.use(express.static(__dirname));

// When someone visits your URL, send them the index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server successfully running on port ${PORT}`);
});
