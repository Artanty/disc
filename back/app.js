const fs = require('fs').promises;
const fs2 = require('fs')
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

//server
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
app.use(cors());
app.use(bodyParser.json());
const multer = require('multer'); // for save temp local file before upload
const upload = multer({ dest: 'uploads/' });
const busboy = require('busboy');


// If modifying these scopes, delete token.json.
const SCOPES = [
  'https://www.googleapis.com/auth/drive.metadata.readonly', // required
  'https://www.googleapis.com/auth/drive', // required
  // 'https://www.googleapis.com/auth/drive.file',
  // 'https://www.googleapis.com/auth/drive.appdata',
  // 'https://www.googleapis.com/auth/drive.scripts',
  // 'https://www.googleapis.com/auth/drive.metadata',
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
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

authorize().then(listFiles).catch(console.error);

const random = (() => {
  const buf = Buffer.alloc(16);
  return () => randomFillSync(buf).toString('hex');
})();

const uploadDir = path.join(__dirname, 'uploads');
if (!fs2.existsSync(uploadDir)) {
  fs2.mkdirSync(uploadDir);
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
    };

    const media = {
      mimeType: file.mimetype,
      body: fs2.createReadStream(file.path),
    };

    const response = await service.files.create({
      requestBody,
      media: media,
    });

    // Delete the temporary file
    await fs.unlink(file.path);

    res.status(200).json({ fileId: response.data.id });
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
    const writer = fs2.createWriteStream(filePath);

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

app.post('/get-updates', async (req, res) => {
  res.status(200).send({ status: 'DISC service connected.' });
})

const PORT = process.env.PORT || 3021;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));