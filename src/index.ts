// Library Imports
import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

// Import other project functions
import {CombinedMetroTrips, RawMetroTrips} from './MetroTrips';
import { MetroPositions } from './MetroPositions';
import { processGTFS } from './GTFSStatic';

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
// If you want to change the port it is recommended to do so in the ./config.json file
const PORT = config.port || 8080;
processGTFS().then(r => console.log("GTFS Processed"))
const app = express();

// Grabs static data

// Swagger definition
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VTDBD API',
      version: '0.1.1',
      description: 'Victorian Transportation Data Broker & Distributor API',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
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
 *     responses:
 *       200:
 *         description: Successful response with Swagger UI
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @openapi
 * /api/raw/metro/positions:
 *   get:
 *     summary: Retrieve GTFS real-time data for Metro trains
 *     description: Fetches GTFS real-time data from the Victorian government API, with Redis caching
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
app.get('/api/raw/metro/positions', async (_req: Request, res: Response) => {
  console.log("Request on GET /api/raw/metro/positions");
  return await MetroPositions(res);
});

/**
 * @openapi
 * /api/raw/metro/trips:
 *   get:
 *     summary: Retrieve trip update data for Metro trains
 *     description: Fetches trip update data from the Victorian government API, with Redis caching
 *     responses:
 *       200:
 *         description: Successful response with trip update data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entity:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "2024-09-11-3234"
 *                       tripUpdate:
 *                         type: object
 *                         properties:
 *                           trip:
 *                             type: object
 *                             properties:
 *                               tripId:
 *                                 type: string
 *                                 example: "244.T5.2-LIL-vpt-29.4.R"
 *                               startTime:
 *                                 type: string
 *                                 example: "19:05:00"
 *                               startDate:
 *                                 type: string
 *                                 example: "20240911"
 *                           stopTimeUpdate:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 stopSequence:
 *                                   type: integer
 *                                   example: 15
 *                                 arrival:
 *                                   type: object
 *                                   properties:
 *                                     time:
 *                                       type: string
 *                                       example: "1726048080"
 *                                 departure:
 *                                   type: object
 *                                   properties:
 *                                     time:
 *                                       type: string
 *                                       example: "1726048140"
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
app.get('/api/raw/metro/trips', async (_req: Request, res: Response) => {
    console.log("Request on GET /api/raw/train-trips");
    return await RawMetroTrips(res);
});

app.get('/api/metro', async (_req: Request, res: Response) => {
  console.log("Request on GET /api/metro/trips");
  return await CombinedMetroTrips(res);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
