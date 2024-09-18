export interface TripStopSequence {
    stopSequence: number;
    stationID?: number; // Only in Augmented Data
    stationName?: string; // Only in Augmented Data
    stop_lat?: string; // Only in Augmented Data
    stop_lon?: string; // Only in Augmented Data
    arrival?: { time: string };
    departure?: { time: string };
}

export interface TripUpdate {
    trip: {
        tripId: string;
        headsign?: string; // Only in Augmented Data
        startTime: string;
        startDate: string;
    };
    stopTimeUpdate: TripStopSequence[];
}

export interface Entity {
    id: string;
    tripUpdate?: TripUpdate;
}

export interface Header {
    gtfsRealtimeVersion: string;
    incrementality: string;
    timestamp: string;
}

export interface MetroTripData {
    header: Header;
    entity: Entity[];
}


export interface TrainStopTimes {
    [key: string]: string; // This allows for any string key
    arrival_time: string;
    departure_time: string;
    stop_id: string;
    stop_sequence: string;
    stop_headsign: string;
    pickup_type: string;
    drop_off_type: string;
    shape_dist_traveled: string;
}

export interface TrainStop {
    [key: string]: string;
    stop_id: string;
    stop_name: string;
    stop_lat: string;
    stop_lon: string;
}