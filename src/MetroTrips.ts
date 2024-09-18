import { Response } from 'express';
import axios from 'axios';
import { createClient } from 'redis';
import protobuf, {Message} from 'protobufjs';
import * as path from 'path';
import * as fs from 'fs';
import {MetroTripData, TripStopSequence, TrainStop, TrainStopTimes} from './types';

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


async function GetRawMetroTripData() {
    const CACHE_KEY = 'TrainTrips';
    const CACHE_TTL = config.cacheTimeout; // Cache TTL in seconds
    let success : boolean;
    // @ts-ignore
    try {
        // Try to get data from Redis cache
        const [cachedData] = await Promise.all([redisClient.get(CACHE_KEY)]);

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
        return [success, error.toString() ]
    }
}

export async function RawMetroTrips(res: Response) {
    const [success, value] = await GetRawMetroTripData()
    if (success){
        return res.json(JSON.parse(value));
    }
    else{
        return res.status(500).json({error: value});
    }

}

async function AugmentMetroTrips(value: string) {
    // Get static data
    const [StaticMetroTrainTripsData, StaticMetroTrainsStopTimesData, StaticMetroTrainsStopsData] = await Promise.all([
        redisClient.get('StaticMetroTrainsTrips'),
        redisClient.get('StaticMetroTrainsStopTimes'),
        redisClient.get('StaticMetroTrainsStops')
    ]);

    const StaticMetroTrainTrips = JSON.parse(StaticMetroTrainTripsData || '[]');
    const StaticMetroTrainsStopTimes: TrainStopTimes[] = JSON.parse(StaticMetroTrainsStopTimesData || '[]');

    // Parse StaticMetroTrainsStops correctly
    let StaticMetroTrainsStops: { [key: string]: TrainStop } = {};
    if (StaticMetroTrainsStopsData) {
        try {
            const parsedStops = JSON.parse(StaticMetroTrainsStopsData);
            // Check if parsedStops is an object with stop_id keys
            if (typeof parsedStops === 'object' && !Array.isArray(parsedStops)) {
                StaticMetroTrainsStops = parsedStops;
            } else if (Array.isArray(parsedStops)) {
                // If it's an array, convert it to an object with stop_id as keys
                parsedStops.forEach((stop: TrainStop) => {
                    if (stop.stop_id) {
                        StaticMetroTrainsStops[stop.stop_id] = stop;
                    }
                });
            }
        } catch (error) {
            console.error('Error parsing StaticMetroTrainsStops:', error);
        }
    }


    // Function to get the trip_id key, handling the invisible character
    function getTripIdKey(obj: TrainStopTimes): string {
        const keys = Object.keys(obj);
        return keys.find(key => key.endsWith('trip_id')) || '';
    }

    const sampleEntry = StaticMetroTrainsStopTimes[0];
    const tripIdKey = getTripIdKey(sampleEntry);

    // Now use this key in your filter
    function findStopsForTrip(tripID: string): TrainStopTimes[] {
        return StaticMetroTrainsStopTimes.filter(entry => entry[tripIdKey] === tripID);
    }

    let data: MetroTripData = JSON.parse(value);

    if (data.entity && Array.isArray(data.entity)) {
        data.entity.forEach((entity: any) => {
            const tripID = entity.tripUpdate?.trip?.tripId;
            if (tripID) {
                // Find the corresponding trip in StaticMetroTrainTrips
                const trips = StaticMetroTrainTrips.filter((trip: { trip_id: string }) => trip.trip_id === tripID);

                if (trips.length === 1) {
                    // Assuming there's a single match, attach additional trip info
                    const matchedTrip = trips[0];
                    entity.tripUpdate.trip.headsign = matchedTrip.trip_headsign;
                }

                const foundStops = findStopsForTrip(tripID);
                let dataStops: TripStopSequence[] = entity.tripUpdate.stopTimeUpdate;

                dataStops.forEach((dataStop, index) => {
                    const stop = foundStops.find(stop => stop.stop_sequence === dataStop.stopSequence.toString());
                    if (stop) {
                        const stopInfo = StaticMetroTrainsStops[stop.stop_id];
                        if (stopInfo) {
                            dataStop.stationID = +stopInfo.stop_id;
                            dataStop.stationName = stopInfo.stop_name;
                            dataStop.stop_lat = stopInfo.stop_lat;
                            dataStop.stop_lon = stopInfo.stop_lon;
                        }
                    }
                });

                entity.tripUpdate.stopTimeUpdate = dataStops;
            }
        });
    }

    return data;
}

export async function CombinedMetroTrips(res: Response) {
    const [success, value] = await GetRawMetroTripData()
    if (success) {
        let data = await AugmentMetroTrips(value);
        return res.json(data);
    }
    else{
        return res.status(500).json({error: value});
    }
}