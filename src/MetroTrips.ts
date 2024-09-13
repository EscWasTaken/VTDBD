import { Response } from 'express';
import axios from 'axios';
import { createClient } from 'redis';
import protobuf from 'protobufjs';
import * as path from 'path';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

// Use protobuf to read the GTFS-Realtime.proto
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
const tripsURL = config.MetroTripsURL;
const apiKey = config.apiKey;

export async function MetroTrips(res: Response) {
    const CACHE_KEY = 'TrainTrips';
    const CACHE_TTL = config.cacheTimeout; // Cache TTL in seconds

    try {
        // Try to get data from Redis cache
        const cachedData = await redisClient.get(CACHE_KEY);

        if (cachedData) {
            // If cache hit, return the cached data
            console.log('train-trips Retrieved From Redis Cache');
            return res.json(JSON.parse(cachedData));
        }

        // If cache miss, fetch data from the API
        console.log('train-trips Not In Redis Cache, Fetching From API');
        const response = await axios.get(tripsURL, {
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
        console.log(`train-trips Retrieved From API and Cached`);

        // Respond with the decoded Protobuf data as JSON
        res.json(feed);
    } catch (error) {
        console.error('Error fetching trip data:', error);
        res.status(500).json({error: 'Failed to fetch trip data'});
    }
}
