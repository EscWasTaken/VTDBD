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
    vehicle?: MetroVehicle;
}

export interface Header {
    gtfsRealtimeVersion: string;
    incrementality: string;
    timestamp: string;
}

export interface MetroData {
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

// Positions Data
export interface MetroVehicle {
    trip: Trip;
    position: Position;
    timestamp: string;
    vehicle?: Vehicle;

}
export interface Position {
    latitude: number;
    longitude: number;
    bearing?: number;
}
export interface Vehicle {
    id: string;
    train?: MetroRollingStock;
    notes?: string;
}

export interface Trip{
        tripId: string;
        headsign?: string; // Only in Augmented Data
        startTime: string;
        startDate: string;
}

export enum MetroRollingStock {
    // Current Rolling Stock
    "Sprinter" = "Sprinter", // Sprinter Rail motors used on Stony Point Shuttle // https://vicsig.net/passenger/rollingstock/railmotors/Sprinter
    "Comeng" = "Comeng", // Commonwealth Engineering //https://vicsig.net/suburban/train/Comeng
    "Siemens" = "Siemens", // Siemens Nexas based off Siemens Modular Metro //https://vicsig.net/suburban/train/Siemens
    "X'Trapolis" = "X'Trapolis", // Alstom X'Trapolis 100  //https://vicsig.net/suburban/train/X%27Trapolis
    "HCMT" = "HCMT", // High Capacity Metro Train // https://vicsig.net/suburban/train/HCMT
    // Future Rolling Stock
    "X'Trapolis 2.0" = "X'Trapolis 2.0" // Alstom X'Trapolis 2.0 // https://en.wikipedia.org/wiki/X%27Trapolis_2.0
}