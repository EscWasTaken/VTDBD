import * as fs from 'fs';
import csv from 'csv-parser';
import {createClient} from 'redis';

// Define the interface for the data in CSV
interface CSVRow {
    [key: string]: string; // Each CSV row will be stored as a key-value pair (e.g., column names and values)
}

interface Stop {
    stop_id: string;
    stop_name: string;
    stop_lat: string;
    stop_lon: string;
}

export async function parseAndCacheStops(fileToSave: string, redisKey: string) {

    const redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    redisClient.on('error', (err) => console.log('Redis Client Error', err));

    await redisClient.connect();

    const stops: { [key: string]: Stop } = {};
    let rowCount = 0;

    return new Promise<void>((resolve, reject) => {
        fs.createReadStream(fileToSave)
            .pipe(csv())
            .on('data', (row) => {
                rowCount++;

                // Find the key that ends with 'stop_id'
                const stopIdKey = Object.keys(row).find(key => key.endsWith('stop_id'));

                if (stopIdKey && row[stopIdKey] && row.stop_name && row.stop_lat && row.stop_lon) {
                    const stop: Stop = {
                        stop_id: row[stopIdKey],
                        stop_name: row.stop_name,
                        stop_lat: row.stop_lat,
                        stop_lon: row.stop_lon,
                    };
                    stops[stop.stop_id] = stop;
                } else {
                }
            })
            .on('end', async () => {
                console.log(`Finished processing ${fileToSave}. Total rows: ${rowCount}, Stops found: ${Object.keys(stops).length}`);

                await redisClient.set(redisKey, JSON.stringify(stops));
                console.log(`Successfully stored ${Object.keys(stops).length} stops in Redis under key: ${redisKey}`);

                await redisClient.disconnect();
                resolve();
            })
            .on('error', (error) => {
                console.error('Error reading CSV:', error);
                reject(error);
            });
    });
}

export const loadCSVToRedis = async (csvFilePath: string, redisKey: string) => {
    // Redis client initialization
    const redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    redisClient.on('error', (err) => console.log('Redis Client Error', err));
    // Connect to Redis
    await (async () => {
        await redisClient.connect();
    })();

    const data: CSVRow[] = []; // Array to store all rows from CSV

    // Create a ReadStream and parse the CSV file
    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row: CSVRow) => {
            data.push(row); // Add each row to the data array
        })
        .on('end', async () => {
            try {
                // Cache the entire array of rows under the given Redis key
                await redisClient.set(redisKey, JSON.stringify(data)); // Store as a JSON string in Redis

                console.log(`Successfully stored data in Redis under key: ${redisKey}`);
                const ttl = await redisClient.ttl(redisKey);
                console.log(`TTL for key ${redisKey}: ${ttl}`);

            } catch (error) {
                console.error(`Error storing data in Redis: ${error}`);
            } finally {
                await redisClient.disconnect(); // Disconnect after operation is complete
            }
        })
        .on('error', (error) => {
            console.error(`Error reading CSV file: ${error}`);
        });
};

