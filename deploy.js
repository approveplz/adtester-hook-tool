const dotenv = require('dotenv');
const { execSync } = require('child_process');

const envConfig = dotenv.config().parsed;

if (!envConfig) {
    console.error('Failed to load .env file');
    process.exit(1);
}

const envVars = Object.entries(envConfig)
    .map(([key, value]) => `${key}="${value}"`)
    .join(',');

const functionName = 'hooksTool';
const runtime = 'nodejs20';
const entryPoint = 'hooksTool';
const memory = '1GB';

const deployCommand = [
    'gcloud functions deploy',
    functionName,
    `--runtime=${runtime}`,
    '--trigger-http',
    '--allow-unauthenticated',
    `--entry-point=${entryPoint}`,
    `--set-env-vars=${envVars}`,
    `--memory=${memory}`,
].join(' ');

console.log('Deploying function:', deployCommand);

try {
    execSync(deployCommand, { stdio: 'inherit' });
    console.log('Function deployed successfully');
} catch (error) {
    console.error('Error deploying function:', error);
    process.exit(1);
}
