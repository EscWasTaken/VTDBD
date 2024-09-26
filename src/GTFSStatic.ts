import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import config from '../config.json';
import {cacheCSV, cacheStops, cacheJSON} from './RedisHandler'
import {MetroRollingStock, Vehicle} from './MetroTypes'

// This file is responsible for checking the existence of and downloading static GTFS data, as well as providing static data to API routes
// Documentation for this data is available at https://data.ptv.vic.gov.au/downloads/GTFSReleaseNotes.pdf

// Helper Functions
async function downloadFile(url: string, outputPath: string): Promise<void> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.writeFile(outputPath, response.data);
}

async function unzip(zipPath: string, outputPath: string): Promise<boolean> {
    try {
        //console.log(`Attempting to unzip file: ${zipPath}`);
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(outputPath, true);
        //console.log(`File unzipped successfully to ${outputPath}`);
        return true;
    } catch (error) {
        console.error(`Error unzipping file ${zipPath}:`, error);
        return false;
    }
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
            await DownloadGTFS();
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
            await DownloadGTFS();
            return;
        }

        // Check if it's time to refresh based on the timestamp
        const timestamp = parseInt(await fs.readFile(timestampFilePath, 'utf-8'), 10);
        const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds

        if (timestamp + refreshStaticTimer < currentTime) {
            console.info('Refresh time reached. Downloading new GTFS data.');
            await DownloadGTFS();
        } else {
            console.info('GTFS data is up to date. Skipping download.');
        }

        console.log('Caching File To Redis, This Might Take A Bit..');
        // Files that will be needed by functions
        let fileToSave;
        // Metro Trains
        fileToSave = path.join(__dirname, 'gtfs-static/2/stop_times.txt');
        console.log('Caching File:' + fileToSave);
        await cacheCSV(fileToSave, 'StaticMetroTrainsStopTimes');

        fileToSave = path.join(__dirname, 'gtfs-static/2/stops.txt');
        console.log('Caching File:' + fileToSave);
        await cacheStops(fileToSave, 'StaticMetroTrainsStops').catch(console.error);

        fileToSave = path.join(__dirname, 'gtfs-static/2/trips.txt');
        console.log('Caching File:' + fileToSave);
        await cacheCSV(fileToSave, 'StaticMetroTrainsTrips');

        fileToSave = path.join(__dirname, 'gtfs-static/2/routes.txt');
        console.log('Caching File:' + fileToSave);
        await cacheCSV(fileToSave, 'StaticMetroTrainsRoutes');

        // Metro Rolling Stock
        fileToSave = path.join(__dirname, 'gtfs-static/MetroRollingStock.json');
        console.log('Caching File:' + fileToSave);
        await cacheJSON(fileToSave, 'StaticMetroRollingStock');

        console.log("GTFS Static Complete");
    } catch (error) {
        console.error('Error processing GTFS:', error);
    }
}

async function DownloadGTFS(): Promise<void> {
    try {
        const staticGTFSURL = config.StaticGTFSURL || 'https://data.ptv.vic.gov.au/downloads/gtfs.zip';
        const zipFilePath = path.join(__dirname, 'gtfs.zip');

        console.log(`Downloading GTFS Static Data from: ${staticGTFSURL}`);
        await downloadFile(staticGTFSURL, zipFilePath);

        console.log('Unzipping main file');
        const gtfsStaticPath = path.join(__dirname, 'gtfs-static');
        const mainUnzipSuccess = await unzip(zipFilePath, gtfsStaticPath);

        if (!mainUnzipSuccess) {
            console.error('Failed to unzip main GTFS file. Aborting further processing.');
            return;
        }

        console.log('Removing ' + zipFilePath);
        await fs.unlink(zipFilePath);
        console.log('Successfully Removed');

        console.log('Looping over all folders, Unzipping, Then Deleting');
        const folders = await fs.readdir(gtfsStaticPath);
        for (const folder of folders) {
            const folderPath = path.join(gtfsStaticPath, folder);
            const stat = await fs.stat(folderPath);

            if (stat.isDirectory() && /^[1-9]|1[01]$/.test(folder)) {
                const zipPath = path.join(folderPath, 'google_transit.zip');
                const unzipSuccess = await unzip(zipPath, folderPath);
                if (unzipSuccess) {
                    await fs.unlink(zipPath);
                } else {
                    console.warn(`Failed to unzip ${zipPath}. Skipping deletion and continuing.`);
                }
            }
        }

        // Get Metro Rolling Stock JSON
        const MetroRollingStockURL = config.MetroRollingStockURL || "https://raw.githubusercontent.com/EscWasTaken/Melbourne-Train-List/refs/heads/main/MelbourneTrains.json";
        const MetroRollingStockFilePath = path.join(gtfsStaticPath, 'MetroRollingStock.json');
        await downloadFile(MetroRollingStockURL, MetroRollingStockFilePath);
        console.log(`Metro Rolling Stock file created at: ${MetroRollingStockFilePath}`);

        // Create timestamp file
        const timestampFilePath = path.join(gtfsStaticPath, 'timestamp.txt');
        const timestamp = Math.floor(Date.now() / 1000);
        await fs.writeFile(timestampFilePath, `${timestamp}`);
        console.log(`Timestamp file created at: ${timestampFilePath}`);

        console.log('GTFS processing completed successfully.');
    } catch (error) {
        console.error('Error Whilst Downloading GTFS Data:', error);
        throw error;
    }
}
