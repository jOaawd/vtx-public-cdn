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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/cdn', express.static('uploads'));

let filesData = [];

app.post('/upload', upload.single('file'), (req, res) => {
  const { description } = req.body;
  if (!req.file) return res.status(400).send('Upload failed or not allowed.');

  const fileUrl = `${req.protocol}://${req.get('host')}/cdn/${req.file.filename}`;
  const fileData = {
    name: req.file.filename,
    url: fileUrl,
    description: description || 'No description provided'
  };

  filesData.push(fileData);
  res.send({ success: true, url: fileUrl });
});

app.get('/files', (req, res) => {
  res.json(filesData);
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));