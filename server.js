const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

const uploadPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const randomName = crypto.randomBytes(8).toString('hex');
    cb(null, `${randomName}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.html' || ext === '.htm') return cb(null, false);
  cb(null, true);
};

const upload = multer({ storage, fileFilter });

app.use(express.static('public'));
app.use('/cdn', express.static('uploads'));

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('Upload failed or not allowed.');
  const fileUrl = `${req.protocol}://${req.get('host')}/cdn/${req.file.filename}`;
  res.send({ success: true, url: fileUrl });
});

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
