const fs = require('fs').promises;
const fs_sync = require('fs')
const path = require('path');
const process = require('process');
const { google } = require('googleapis');
require('dotenv').config();

//server
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
app.use(cors());
app.use(bodyParser.json());
const multer = require('multer'); // for save temp local file before upload
const upload = multer({ dest: 'uploads/' });

const SCOPE = [
  'https://www.googleapis.com/auth/drive.metadata.readonly', // required
  'https://www.googleapis.com/auth/drive', // required
  // 'https://www.googleapis.com/auth/drive.file',
  // 'https://www.googleapis.com/auth/drive.appdata',
  // 'https://www.googleapis.com/auth/drive.scripts',
  // 'https://www.googleapis.com/auth/drive.metadata',
];


async function authorize() {
  const jwtClient = new google.auth.JWT(
    process.env.GOOGLE_API_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_API_PRIVATE_KEY,
    SCOPE
  )

  await jwtClient.authorize()
  // console.log(jwtClient)

  return jwtClient
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFiles(authClient) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  const res = await drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log('No files found.');
    return;
  }

  console.log('Files:');
  files.map((file) => {
    console.log(`${file.name} (${file.id})`);
  });
}

const uploadDir = path.join(__dirname, 'uploads');
if (!fs_sync.existsSync(uploadDir)) {
  fs_sync.mkdirSync(uploadDir);
}

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).send('No file uploaded.');
    }
    const auth = await authorize()

    const service = google.drive({ version: 'v3', auth });

    const requestBody = {
      name: file.originalname,
      fields: 'id',
      parents: ["1_I-eTR4nR3Vsf-Kv5QWFKSY_nJbFm0X6"]
    };

    const media = {
      mimeType: file.mimetype,
      body: fs_sync.createReadStream(file.path),
    };

    const response = await service.files.create({
      requestBody,
      media: media,
    });

    // Delete the temporary file
    await fs.unlink(file.path);

    res.status(200).json({ fileId: response.data.id });
    console.log('Upload complete');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Function to download file from Google Drive
async function downloadFile(realFileId) {
  const auth = await authorize()

  const service = google.drive({ version: 'v3', auth });

  try {
    const file = await service.files.get({
      fileId: realFileId,
      alt: 'media',
      acknowledgeAbuse: true,
    }, { responseType: 'stream' });

    // Create a writable stream to save the file
    const filePath = path.join(__dirname, 'downloads', realFileId);
    const writer = fs_sync.createWriteStream(filePath);

    file.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log('Download complete');
        resolve(filePath);
      });
      writer.on('error', (err) => {
        console.error('Error writing file', err);
        reject(err);
      });
    });
  } catch (err) {
    console.error('Error downloading file', err);
    throw err;
  }
}

// Route to handle file download request
app.post('/download', async (req, res) => {
  // console.log(req.body)
  const fileId = req.body.fileId;
  if (!fileId) {
    return res.status(400).send('File ID is required');
  }

  try {
    const filePath = await downloadFile(fileId);
    res.download(filePath, (err) => {
      if (err) {
        res.status(500).send(err.message);
      }
      // Optionally, delete the file after sending it
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting file', unlinkErr);
      });
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Route to handle file delete request
app.post('/delete', async (req, res) => {
  try {
    const fileId = req.body.fileId;
    if (!fileId) {
      return res.status(400).send('File ID is required');
    }
    const auth = await authorize()

    const service = google.drive({ version: 'v3', auth });

    const response = await service.files.delete({
      fileId: fileId
    });

    res.status(200).json({ fileId: response.data.id });
    console.log('Delete complete');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/get-updates', async (req, res) => {
  res.status(200).send({ status: 'DISC service connected.' });
})


// Function to delete all files and folders in a directory
function deleteFolderRecursive(directoryPath) {
  if (fs_sync.existsSync(directoryPath)) {
    fs_sync.readdirSync(directoryPath).forEach((file, index) => {
      const curPath = path.join(directoryPath, file);
      if (fs_sync.lstatSync(curPath).isDirectory()) { // Recursive call for directories
        deleteFolderRecursive(curPath);
      } else { // Delete file
        fs_sync.unlinkSync(curPath);
      }
    });
    // fs_sync.rmdirSync(directoryPath); // Remove the now empty directory
  }
}

// Function to erase the contents of the downloads and uploads folders
function eraseFolders() {
  const downloadsPath = path.join(__dirname, 'downloads');
  const uploadsPath = path.join(__dirname, 'uploads');

  // Delete contents of downloads folder
  if (fs_sync.existsSync(downloadsPath)) {
    deleteFolderRecursive(downloadsPath);
    console.log('Downloads folder erased.');
  } else {
    console.log('Downloads folder does not exist.');
  }

  // Delete contents of uploads folder
  if (fs_sync.existsSync(uploadsPath)) {
    deleteFolderRecursive(uploadsPath);
    console.log('Uploads folder erased.');
  } else {
    console.log('Uploads folder does not exist.');
  }
}

// Call the eraseFolders function to erase the contents of the downloads and uploads folders
eraseFolders();

authorize().then(listFiles).catch(console.error);

const PORT = process.env.PORT || 3021;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));