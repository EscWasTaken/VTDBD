import { Response } from 'express';
import axios from 'axios';
import { createClient } from 'redis';
import protobuf, { Message } from 'protobufjs';
import * as path from 'path';
import * as fs from 'fs';
import { MetroData, TrainStop, TrainStopTimes, TripStopSequence } from './types';

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

// The Vic Gov API endpoints and your API key
const gtfsUrl = config.MetroGTFSRURL;
const tripsURL = config.MetroTripsURL;
const apiKey = config.apiKey;

export async function GetMetroPositions() {
    let success: boolean;
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
        return [success, error.toString()];
    }
}

export async function MetroPositions(res: Response) {
    const [success, value] = await GetMetroPositions();
    if (success) {
        return res.json(JSON.parse(value));
    } else {
        return res.status(500).json({ error: value });
    }
}

async function GetRawMetroTripData() {
    const CACHE_KEY = 'TrainTrips';
    const CACHE_TTL = config.cacheTimeout; // Cache TTL in seconds
    let success: boolean;

    try {
        // Try to get data from Redis cache
        const cachedData = await redisClient.get(CACHE_KEY);

        if (cachedData) {
            // If cache hit, return the cached data
            console.log('train-trips Retrieved From Redis Cache');
            success = true;
            return [success, cachedData];
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
        let feed: Message<{}>;
        feed = FeedMessageType.decode(buffer);
        const data: string = JSON.stringify(feed);
        // Cache the decoded data
        await redisClient.setEx(CACHE_KEY, CACHE_TTL, data);
        console.log(`train-trips Retrieved From API and Cached`);

        // Respond with the decoded Protobuf data as JSON
        success = true;
        return [success, data];
    } catch (error: any) {
        console.error('Error fetching trip data:', error);
        success = false;
        return [success, error.toString()];
    }
}

export async function RawMetroTrips(res: Response) {
    const [success, value] = await GetRawMetroTripData();
    if (success) {
        return res.json(JSON.parse(value));
    } else {
        return res.status(500).json({ error: value });
    }
}

async function AugmentMetroTrips(rawTripsData: string, positionsData: any) {
    // Get static data
    const [StaticMetroTrainTripsData, StaticMetroTrainsStopTimesData, StaticMetroTrainsStopsData] = await Promise.all([
        redisClient.get('StaticMetroTrainsTrips'),
        redisClient.get('StaticMetroTrainsStopTimes'),
        redisClient.get('StaticMetroTrainsStops')
    ]);

    // Parse and preprocess static data
    const StaticMetroTrainTrips: Map<string, any> = new Map(
        JSON.parse(StaticMetroTrainTripsData || '[]').map((trip: any) => [trip.trip_id, trip])
    );

    const StaticMetroTrainsStopTimes: Map<string, TrainStopTimes[]> = new Map();
    JSON.parse(StaticMetroTrainsStopTimesData || '[]').forEach((stopTime: TrainStopTimes) => {
        const tripId = stopTime[getTripIdKey(stopTime)];
        if (!StaticMetroTrainsStopTimes.has(tripId)) {
            StaticMetroTrainsStopTimes.set(tripId, []);
        }
        StaticMetroTrainsStopTimes.get(tripId)!.push(stopTime);
    });

    const StaticMetroTrainsStops: Map<string, TrainStop> = new Map(
        Object.entries(JSON.parse(StaticMetroTrainsStopsData || '{}'))
    );

    // Preprocess positions data for faster lookups
    const positionsMap: Map<string, any> = new Map();

    // Check if positionsData is a string (from cache) or an object (from API)
    const positionsEntity = typeof positionsData === 'string' ? JSON.parse(positionsData).entity : positionsData.entity;

    if (Array.isArray(positionsEntity)) {
        positionsEntity.forEach(entity => {
            if (entity.vehicle?.trip?.tripId) {
                positionsMap.set(entity.vehicle.trip.tripId, entity.vehicle);
            }
        });
    }

    function getTripIdKey(obj: TrainStopTimes): string {
        return Object.keys(obj).find(key => key.endsWith('trip_id')) || '';
    }

    let tripData: MetroData = typeof rawTripsData === 'string' ? JSON.parse(rawTripsData) : rawTripsData;

    if (tripData.entity && Array.isArray(tripData.entity)) {
        tripData.entity.forEach((entity: any) => {
            const tripID = entity.tripUpdate?.trip?.tripId;
            if (tripID) {
                // Attach Vehicle Positions
                const position = positionsMap.get(tripID);
                if (position) {
                    entity.vehicle = position;
                }

                // Attach Head sign For Trip
                const trip = StaticMetroTrainTrips.get(tripID);
                if (trip) {
                    entity.tripUpdate.trip.headsign = trip.trip_headsign;
                }

                // Attach Stop Information
                const foundStops = StaticMetroTrainsStopTimes.get(tripID) || [];
                let dataStops: TripStopSequence[] = entity.tripUpdate.stopTimeUpdate;
                dataStops.forEach((dataStop) => {
                    const stop = foundStops.find(stop => stop.stop_sequence === dataStop.stopSequence.toString());
                    if (stop) {
                        const stopInfo = StaticMetroTrainsStops.get(stop.stop_id);
                        if (stopInfo) {
                            Object.assign(dataStop, {
                                stationID: +stopInfo.stop_id,
                                stationName: stopInfo.stop_name,
                                stop_lat: stopInfo.stop_lat,
                                stop_lon: stopInfo.stop_lon
                            });
                        }
                    }
                });
                entity.tripUpdate.stopTimeUpdate = dataStops;
            }
        });
    }

    return tripData;
}
export async function CombinedMetroTrips(res: Response) {
    const [successTrips, trips] = await GetRawMetroTripData();
    const [successPos, positions] = await GetMetroPositions();
    if (successTrips && successPos) {
        let data = await AugmentMetroTrips(trips, positions);
        return res.json(data);
    } else if (successTrips && !successPos) {
        return res.status(500).json({ error: positions });
    } else if (!successTrips && successPos) {
        return res.status(500).json({ error: trips });
    } else {
        return res.status(500).json({ error: trips, positions });
    }
}