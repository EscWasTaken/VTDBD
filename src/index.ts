// Library Imports
import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

// Import other project functions
import {CombinedMetroTrips, RawMetroTrips, MetroPositions} from './MetroFunctions'
import { returnStaticData, returnStaticJSON} from './RedisHandler'
import { processGTFS } from './GTFSStatic';

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
// If you want to change the port it is recommended to do so in the ./config.json file
const PORT = config.port || 8080;

(async () => {
  processGTFS().then(() => console.log("GTFS Processed"))
})();

const app = express();

// Allows for the favicon to work correctly
app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

// Custom Swagger CSS
const customCss = `
  .swagger-ui .topbar { 
    display: none;
  }
  .swagger-ui .info .title { 
    color: #FF6A00;
  }
`;

// Custom options for swagger-ui-express
const swaggerUiOptions = {
  customCss,
  explorer: true,
  customSiteTitle: "VTDBD API Documentation",
  customfavIcon: "/favicon.ico",
};

// Swagger definition
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VTDBD API',
      version: '0.1.1',
      description: 'Victorian Transportation Data Broker & Distributor API',
    },
    tags: [
      {
        name: 'Documentation',
        description: 'API Documentation',
      },
      {
        name: 'Metro',
        description: 'Trains that run in the Greater Melbourne',
      }
      ],
    servers: [
      {
        url: `http://localhost:${PORT}`,
      },
    ],
  },
  apis: [path.resolve(__dirname, 'index.ts')], // Use path.resolve to get the full path
};
/**
 * @openapi
 * /api-docs:
 *   get:
 *     summary: Swagger UI
 *     description: Serves the Swagger UI for API documentation
 *     tags:
 *      - Documentation
 *     responses:
 *       200:
 *         description: Successful response with Swagger UI
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, swaggerUiOptions));

// Metro
/**
 * @openapi
 * /api/metro:
 *   get:
 *     summary: Retrieve Metro train trip updates
 *     description: Fetches real-time trip updates for Metro trains, including stop times and station information
 *     tags:
 *      - Metro
 *     responses:
 *       200:
 *         description: Successful response with Metro train trip updates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 header:
 *                   type: object
 *                   properties:
 *                     gtfsRealtimeVersion:
 *                       type: string
 *                       example: "2.0"
 *                     incrementality:
 *                       type: string
 *                       example: "FULL_DATASET"
 *                     timestamp:
 *                       type: string
 *                       example: "1726919850"
 *                 entity:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "2024-09-21-X097"
 *                       tripUpdate:
 *                         type: object
 *                         properties:
 *                           trip:
 *                             type: object
 *                             properties:
 *                               tripId:
 *                                 type: string
 *                                 example: "100.T2.2-SHM-vpt-37.4.H"
 *                               startTime:
 *                                 type: string
 *                                 example: "21:57:00"
 *                               startDate:
 *                                 type: string
 *                                 example: "20240921"
 *                               headsign:
 *                                 type: string
 *                                 example: "Sandringham"
 *                           stopTimeUpdate:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 stopSequence:
 *                                   type: integer
 *                                   example: 1
 *                                 arrival:
 *                                   type: object
 *                                   properties:
 *                                     time:
 *                                       type: string
 *                                       example: "1726919280"
 *                                 departure:
 *                                   type: object
 *                                   properties:
 *                                     time:
 *                                       type: string
 *                                       example: "1726919820"
 *                                 stationID:
 *                                   type: integer
 *                                   example: 19854
 *                                 stationName:
 *                                   type: string
 *                                   example: "Flinders Street Railway Station (Melbourne City)"
 *                                 stop_lat:
 *                                   type: string
 *                                   example: "-37.8183051340647"
 *                                 stop_lon:
 *                                   type: string
 *                                   example: "144.966964346167"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
app.get('/api/metro', async (_req: Request, res: Response) => {
  console.log("Request on GET /api/metro");
  return await CombinedMetroTrips(res);
});

/**
 * @openapi
 * /api/metro/raw/positions:
 *   get:
 *     summary: Retrieve GTFS real-time data for Metro trains
 *     description: Fetches GTFS real-time data from the Victorian government API, with Redis caching
 *     tags:
 *      - Metro
 *     responses:
 *       200:
 *         description: Successful response with GTFS real-time data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 header:
 *                   type: object
 *                   properties:
 *                     gtfsRealtimeVersion:
 *                       type: string
 *                       example: "2.0"
 *                     incremental:
 *                       type: string
 *                       example: "FULL_DATASET"
 *                     timestamp:
 *                       type: string
 *                       example: "1725939152"
 *                 entity:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "2024-09-10-5002"
 *                       vehicle:
 *                         type: object
 *                         properties:
 *                           trip:
 *                             type: object
 *                             properties:
 *                               tripId:
 *                                 type: string
 *                                 example: "212.T5.2-UFD-vpt-29.1.R"
 *                               startTime:
 *                                 type: string
 *                                 example: "12:57:00"
 *                               startDate:
 *                                 type: string
 *                                 example: "20240910"
 *                           position:
 *                             type: object
 *                             properties:
 *                               latitude:
 *                                 type: number
 *                                 format: float
 *                                 example: -37.81956481933594
 *                               longitude:
 *                                 type: number
 *                                 format: float
 *                                 example: 144.96127319335938
 *                               bearing:
 *                                 type: number
 *                                 format: float
 *                                 example: 82.80545043945312
 *                           timestamp:
 *                             type: string
 *                             example: "1725939073"
 *                           vehicle:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: "1029T-1047T-357M-358M-391M-392M"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
app.get('/api/metro/raw/positions', async (_req: Request, res: Response) => {
  console.log("Request on GET /api/metro/raw/positions");
  return await MetroPositions(res);
});

/**
 * @openapi
 * /api/metro/raw/trips:
 *   get:
 *     summary: Retrieve raw Metro train trip updates
 *     description: Fetches real-time trip updates for Metro trains, including detailed stop time information
 *     tags:
 *      - Metro
 *     responses:
 *       200:
 *         description: Successful response with Metro train trip updates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 header:
 *                   type: object
 *                   properties:
 *                     gtfsRealtimeVersion:
 *                       type: string
 *                       example: "2.0"
 *                     incrementality:
 *                       type: string
 *                       example: "FULL_DATASET"
 *                     timestamp:
 *                       type: string
 *                       example: "1726920151"
 *                 entity:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "2024-09-21-X097"
 *                       tripUpdate:
 *                         type: object
 *                         properties:
 *                           trip:
 *                             type: object
 *                             properties:
 *                               tripId:
 *                                 type: string
 *                                 example: "100.T2.2-SHM-vpt-37.4.H"
 *                               startTime:
 *                                 type: string
 *                                 example: "21:57:00"
 *                               startDate:
 *                                 type: string
 *                                 example: "20240921"
 *                           stopTimeUpdate:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 stopSequence:
 *                                   type: integer
 *                                   example: 1
 *                                 arrival:
 *                                   type: object
 *                                   properties:
 *                                     time:
 *                                       type: string
 *                                       example: "1726919220"
 *                                 departure:
 *                                   type: object
 *                                   properties:
 *                                     time:
 *                                       type: string
 *                                       example: "1726919820"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
app.get('/api/metro/raw/trips', async (_req: Request, res: Response) => {
    console.log("Request on GET /api/metro/raw/trips");
    return await RawMetroTrips(res);
});



/**
 * @openapi
 * /api/metro/raw/static/routes:
 *   get:
 *     summary: Retrieve static Metro train route information
 *     description: Fetches static information about Metro train routes, including route ID, short name, long name, and color codes.
 *     tags:
 *      - Metro
 *     responses:
 *       200:
 *         description: Successful response with Metro train route details
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   route_id:
 *                     type: string
 *                     example: "2-ALM-vpt-1"
 *                   agency_id:
 *                     type: string
 *                     example: ""
 *                   route_short_name:
 *                     type: string
 *                     example: "Alamein"
 *                   route_long_name:
 *                     type: string
 *                     example: "Alamein - City (Flinders Street)"
 *                   route_type:
 *                     type: string
 *                     example: "2"
 *                   route_color:
 *                     type: string
 *                     example: "152C6B"
 *                   route_text_color:
 *                     type: string
 *                     example: "FFFFFF"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal Server Error"
 */
app.get('/api/metro/raw/static/routes', async (_req: Request, res: Response) => {
  console.log("Request on GET /api/metro/raw/static/routes");
  try {
    const data = await returnStaticData("StaticMetroTrainsRoutes");
    return res.status(200).json(data);
  }
  catch (err) {
    return res.status(500).json({ error: err });
  }
});

/**
 * @openapi
 * /api/metro/raw/static/stop-times:
 *   get:
 *     summary: Retrieve static Metro train stop times
 *     description: Fetches static information about Metro train stop times, including arrival and departure times, stop details, and trip IDs.
 *     tags:
 *      - Metro
 *     responses:
 *       200:
 *         description: Successful response with Metro train stop times details
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   trip_id:
 *                     type: string
 *                     example: "1.T2.2-ALM-vpt-1.1.R"
 *                   arrival_time:
 *                     type: string
 *                     example: "04:57:00"
 *                   departure_time:
 *                     type: string
 *                     example: "04:57:00"
 *                   stop_id:
 *                     type: string
 *                     example: "19847"
 *                   stop_sequence:
 *                     type: string
 *                     example: "1"
 *                   stop_headsign:
 *                     type: string
 *                     example: ""
 *                   pickup_type:
 *                     type: string
 *                     example: "0"
 *                   drop_off_type:
 *                     type: string
 *                     example: "0"
 *                   shape_dist_traveled:
 *                     type: string
 *                     example: "0.00"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal Server Error"
 */
app.get('/api/metro/raw/static/stop-times', async (_req: Request, res: Response) => {
  console.log("Request on GET /api/metro/raw/static/stop-times");
  try {
    const data = await returnStaticData("StaticMetroTrainsStopTimes");
    return res.status(200).json(data);
  }
  catch (err) {
    return res.status(500).json({ error: err });
  }
});

/**
 * @openapi
 * /api/metro/raw/static/stops:
 *   get:
 *     summary: Retrieve static Metro train stop information
 *     description: Fetches static details about Metro train stops, including stop ID, name, and geographical coordinates.
 *     tags:
 *      - Metro
 *     responses:
 *       200:
 *         description: Successful response with Metro train stop details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   stop_id:
 *                     type: string
 *                     example: "22180"
 *                   stop_name:
 *                     type: string
 *                     example: "Southern Cross Railway Station (Melbourne City)"
 *                   stop_lat:
 *                     type: string
 *                     example: "-37.8179364275358"
 *                   stop_lon:
 *                     type: string
 *                     example: "144.951411219786"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal Server Error"
 */
app.get('/api/metro/raw/static/stops', async (_req: Request, res: Response) => {
  console.log("/api/metro/raw/static/stops");
  try {
    const data = await returnStaticData("StaticMetroTrainsStops");
    return res.status(200).json(data);
  }
  catch (err) {
    return res.status(500).json({ error: err });
  }
});

/**
 * @openapi
 * /api/metro/raw/static/trips:
 *   get:
 *     summary: Retrieve static Metro train trip information
 *     description: Fetches static information about Metro train trips, including route ID, trip ID, headsign, and direction.
 *     tags:
 *      - Metro
 *     responses:
 *       200:
 *         description: Successful response with Metro train trip details
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   route_id:
 *                     type: string
 *                     example: "2-ALM-vpt-1"
 *                   service_id:
 *                     type: string
 *                     example: "T2_2"
 *                   trip_id:
 *                     type: string
 *                     example: "1.T2.2-ALM-vpt-1.1.R"
 *                   shape_id:
 *                     type: string
 *                     example: "2-ALM-vpt-1.1.R"
 *                   trip_headsign:
 *                     type: string
 *                     example: "Camberwell"
 *                   direction_id:
 *                     type: string
 *                     example: "1"
 *                   block_id:
 *                     type: string
 *                     example: ""
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal Server Error"
 */
app.get('/api/metro/raw/static/trips', async (_req: Request, res: Response) => {
  console.log("Request on GET /api/metro/raw/static/trips");
  try {
    const data = await returnStaticData("StaticMetroTrainsTrips");
    return res.status(200).json(data);
  }
  catch (err) {
    return res.status(500).json({ error: err });
  }
});


/**
 * @openapi
 *  /api/metro/raw/static/rolling-stock:
 *   get:
 *     summary: Retrieve static Metro Rolling Stock information
 *     description: Fetches static information about Metro Rolling Stock, carriage id set, notes, and train type.
 *     tags:
 *      - Metro
 *     responses:
 *       200:
 *         description: Successful Response With Metro Rolling Stock Details
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "324M-1031T-342M"
 *                   notes:
 *                     type: string
 *                     example: "Refurbished - EDI-Rail"
 *                   train:
 *                     type: string
 *                     example: "Comeng"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal Server Error"
 */
app.get('/api/metro/raw/static/rolling-stock', async (_req: Request, res: Response) => {
  console.log("Request on GET /api/metro/raw/static/rolling-stock");
  try {
    const data = await returnStaticJSON("StaticMetroRollingStock");
    return res.status(200).json(data);
  }
  catch (err) {
    return res.status(500).json({ error: err });
  }
})

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
