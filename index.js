// index.js
const functions = require('@google-cloud/functions-framework');
const express = require('express');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

const app = express();

const BUCKET_NAME = 'hooks-tools';
const storage = new Storage();
const makeWebhookUrl =
    'https://hook.us1.make.com/c2fu3nsembr2jgr749my6l7srhozhflm';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    console.log('Serving index.html');
    console.log({ dirName: __dirname });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Webhook endpoint to handle incoming requests
app.post('/api/creatomate_webhook', express.json(), async (req, res) => {
    try {
        console.log('Received webhook payload:', req.body);
        console.log({ reqBody: req.body });

        const {
            id,
            status,
            url: creatomateUrl,
            metadata: metadataJSON,
        } = req.body;

        const metadata = JSON.parse(metadataJSON);

        const {
            ad_name: adName,
            main_video_url: mainVideoUrl,
            hook_name: hookVideoName,
        } = metadata;

        console.log(`Checking file at: ${mainVideoUrl}`);
        const checkResponse = await fetch(mainVideoUrl, {
            method: 'HEAD',
        });

        if (checkResponse.ok) {
            console.log(`Deleting file at: ${mainVideoUrl}`);
            const response = await fetch(mainVideoUrl, {
                method: 'DELETE',
            });
            console.log(`File deleted at: ${mainVideoUrl}`);
            if (!response.ok) {
                throw new Error(
                    `Failed to delete file: ${response.statusText}`
                );
            }
        } else {
            console.log(
                `File does not exist or already deleted at: ${mainVideoUrl}`
            );
        }

        if (status !== 'succeeded') {
            console.error(
                `Creatomate job failed. mainVideoUrl: ${mainVideoUrl}. id: ${id}. adName: ${adName}`
            );
            return res.status(500).json({ error: 'Creatomate job failed' });
        }

        console.log('Sending webhook to Make');
        const makeResponse = await fetch(makeWebhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                creatomate_url: creatomateUrl,
                name: `${adName}-HOOK-${hookVideoName}.mp4`,
                id,
            }),
        });
        console.log('Webhook sent to Make');

        res.status(200).json({ message: 'Webhook received successfully' });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add the route to serve the Creatomate API key
app.get('/api/creatomate_key', (req, res) => {
    const apiKey = process.env.CREATOMATE_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'API key not found on server.' });
    }

    res.json({ apiKey: apiKey });
});

functions.http('hooksTool', app);
