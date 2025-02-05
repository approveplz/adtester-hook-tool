import { http } from '@google-cloud/functions-framework';
import express, { Request, Response } from 'express';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import 'dotenv/config';

const app = express();

const BUCKET_NAME = 'hooks-tools';
const storage = new Storage();
const makeWebhookUrl =
    'https://hook.us1.make.com/c2fu3nsembr2jgr749my6l7srhozhflm';

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html on the root path
app.get('/', (req: Request, res: Response) => {
    console.log('Serving index.html');
    console.log({ dirName: __dirname });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Webhook endpoint to handle Creatomate webhook events
app.post(
    '/api/creatomate_webhook',
    express.json(),
    async (req: Request, res: Response): Promise<void> => {
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
            // Using global fetch (if needed, install and import node-fetch in older Node versions)
            const checkResponse = await fetch(mainVideoUrl, { method: 'HEAD' });
            if (checkResponse.ok) {
                console.log(`Deleting file at: ${mainVideoUrl}`);
                const deleteResponse = await fetch(mainVideoUrl, {
                    method: 'DELETE',
                });
                console.log(`File deleted at: ${mainVideoUrl}`);
                if (!deleteResponse.ok) {
                    throw new Error(
                        `Failed to delete file: ${deleteResponse.statusText}`
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
                res.status(500).json({ error: 'Creatomate job failed' });
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

            await makeResponse.json();

            res.status(200).json({ message: 'Webhook received successfully' });
        } catch (error) {
            console.error('Error processing webhook:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// GET route to return the Creatomate API key (internal tool use only)
app.get('/api/creatomate_key', (req: Request, res: Response): void => {
    const apiKey = process.env.CREATOMATE_API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'API key not found on server.' });
        return;
    }
    res.json({ apiKey });
});

// Expose the Express app as a Cloud Function using the Functions Framework
http('hooksTool', app);
