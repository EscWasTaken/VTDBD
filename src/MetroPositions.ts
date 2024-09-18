import { Response } from 'express';
import axios from 'axios';
import { createClient } from 'redis';
import protobuf from 'protobufjs';
import * as path from 'path';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

// Get protobuf to work
const root = protobuf.loadSync(path.join(__dirname, 'gtfs-realtime', 'gtfs-realtime.proto'));
const FeedMessageType = root.lookupType('transit_realtime.FeedMessage');

// Redis client initialization
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});
redisClient.on('error', (err) => console.log('Redis Client Error', err));
// Connect to Redis
(async () => {
    await redisClient.connect();
})();

// The Vic Gov API endpoint and your API key
const gtfsUrl = config.MetroGTFSRURL;
const apiKey = config.apiKey;

export async function GetMetroPositions() {
    let success : boolean;
    const CACHE_KEY = 'TrainPositions';
    const CACHE_TTL = config.cacheTimeout; // Cache TTL in seconds

    try {
        // Try to get data from Redis cache
        const cachedData = await redisClient.get(CACHE_KEY);

        if (cachedData) {
            // If cache hit, return the cached data
            console.log('train-GTFSR Retrieved From Redis Cache');
            success = true;
            return [success, cachedData];
        }

        // If cache miss, fetch data from the API
        console.log('train-GTFSR Not In Redis Cache, Fetching From API');
        const response = await axios.get(gtfsUrl, {
            responseType: 'arraybuffer',
            headers: {
                'Ocp-Apim-Subscription-Key': apiKey,
            },
        });

        // Decode the Protobuf binary response
        const buffer = Buffer.from(response.data);
        const feed = FeedMessageType.decode(buffer);

        // Cache the decoded data
        await redisClient.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(feed));
        console.log(`train-GTFSR Retrieved From API and Cached`);

        // Respond with the decoded Protobuf data as JSON
        success = true;
        return [success, feed];
    } catch (error: any) {
        success = false;
        console.error('Error fetching GTFS real-time data:', error);
        return [success, error.toString() ]
    }
}

export async function MetroPositions(res: Response) {
    const [success, value] = await GetMetroPositions()
    if (success){
        return res.json(JSON.parse(value));
    }
    else{
        return res.status(500).json({error: value});
    }
}
