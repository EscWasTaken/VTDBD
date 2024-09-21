import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import config from '../config.json';
import {parseAndCacheStops, loadCSVToRedis} from './RedisCacher'

// This file is responsible for checking the existence of and downloading static GTFS data
// Documentation for this data is available at https://data.ptv.vic.gov.au/downloads/GTFSReleaseNotes.pdf

// Helper Functions
async function downloadFile(url: string, outputPath: string): Promise<void> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.writeFile(outputPath, response.data);
}

async function unzip(zipPath: string, outputPath: string): Promise<void> {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(outputPath, true);
}

export async function processGTFS(): Promise<void> {
    console.info('Checking GTFS Static Data');
    try {
        // Read RefreshStaticTimer from config
        const refreshStaticTimer = config.RefreshStaticTimer;

        if (refreshStaticTimer === -1) {
            // Assuming that there will always be data here,
            // this should be the responsibility of the user not the program
            console.info('RefreshStaticTimer is -1. Skipping GTFS download and processing.');
            return;
        }

        if (refreshStaticTimer === 0) {
            console.info('RefreshStaticTimer is 0. Always downloading GTFS.');
            await downloadAndProcessGTFS();
            return;
        }

        const gtfsStaticPath = path.join(__dirname, 'gtfs-static');
        const timestampFilePath = path.join(gtfsStaticPath, 'timestamp.txt');

        // Check if gtfs-static folder and timestamp.txt exist
        const [folderExists, fileExists] = await Promise.all([
            fs.access(gtfsStaticPath).then(() => true).catch(() => false),
            fs.access(timestampFilePath).then(() => true).catch(() => false)
        ]);

        if (!folderExists || !fileExists) {
            console.info('GTFS Static folder or timestamp file does not exist. Proceeding with download.');
            await downloadAndProcessGTFS();
            return;
        }

        // Check if it's time to refresh based on the timestamp
        const timestamp = parseInt(await fs.readFile(timestampFilePath, 'utf-8'), 10);
        const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds

        if (timestamp + refreshStaticTimer < currentTime) {
            console.info('Refresh time reached. Downloading new GTFS data.');
            await downloadAndProcessGTFS();
        } else {
            console.info('GTFS data is up to date. Skipping download.');
        }
        console.log('Caching File To Redis, This Might Take A Bit..');
        // Files that will be needed by functions
        let fileToSave;
        // Metro Trains
        fileToSave = path.join(__dirname, 'gtfs-static/2/stop_times.txt');
        console.log('Caching File:' + fileToSave);
        await loadCSVToRedis(fileToSave, 'StaticMetroTrainsStopTimes');

        fileToSave = path.join(__dirname, 'gtfs-static/2/stops.txt');
        console.log('Caching File:' + fileToSave);
        await parseAndCacheStops(fileToSave, 'StaticMetroTrainsStops').catch(console.error);

        fileToSave = path.join(__dirname, 'gtfs-static/2/trips.txt');
        console.log('Caching File:' + fileToSave);
        await loadCSVToRedis(fileToSave, 'StaticMetroTrainsTrips');

        console.log("GTFS Static Complete");
    } catch (error) {
        console.error('Error processing GTFS:', error);
    }
}

async function downloadAndProcessGTFS(): Promise<void> {
    // 1. Download zip file
    const staticGTFSURL = config.StaticGTFSURL || 'https://data.ptv.vic.gov.au/downloads/gtfs.zip';
    const zipFilePath = path.join(__dirname, 'gtfs.zip');
    console.info('Downloading GTFS Static Data From: ' + staticGTFSURL);
    await downloadFile(staticGTFSURL, zipFilePath);
    console.info('Downloaded successfully');

    // 2. Unzip the file
    console.info('Unzipping ' + zipFilePath);
    const gtfsStaticPath = path.join(__dirname, 'gtfs-static');
    await unzip(zipFilePath, gtfsStaticPath);
    console.info('Successfully Unzipped');

    // 3. Remove the original zip file
    console.info('Removing ' + zipFilePath);
    await fs.unlink(zipFilePath);
    console.info('Successfully Removed');

    // 4. Loop over all folders in gtfs-static
    console.info('Looping over all folders, Unzipping, Then Deleting');
    const folders = await fs.readdir(gtfsStaticPath);
    for (const folder of folders) {
        const folderPath = path.join(gtfsStaticPath, folder);
        const stat = await fs.stat(folderPath);

        if (stat.isDirectory() && /^[1-9]|1[01]$/.test(folder)) {
            // 5. Unzip google_transit.zip in each folder
            const zipPath = path.join(folderPath, 'google_transit.zip');
            await unzip(zipPath, folderPath);
            await fs.unlink(zipPath);
        }
    }

    // 6. Create timestamp file
    const timestampFilePath = path.join(gtfsStaticPath, 'timestamp.txt');
    const timestamp = Math.floor(Date.now() / 1000); // Current time in seconds
    await fs.writeFile(timestampFilePath, `${timestamp}`);
    console.log(`Timestamp file created at: ${timestampFilePath}`);
    console.log('GTFS processing completed successfully.');
}