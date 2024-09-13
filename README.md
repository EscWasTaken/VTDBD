# VTDBD - Victorian Transportation Data Broker &amp; Distributor

---

## What Is a VTDBD Anyways?
VTDBD is short for the Victorian Transportation Data Broker and Distributor.

The main goal of VTDBD is to grab information about Trains (Metro and V/Line), Trams, and Buses (Metro, V/Line, and Town) and provide them in a neat API interface to be used by other software.

VTDBD is intended only to be a backend software, and is never intended to be run by non-developers.

## How To Run
The easiest way to run VTDBD is via `npm run docker` which will build the VTDBD and Redis container.
You will need [Docker Desktop](https://www.docker.com/products/docker-desktop/) to run this.

At this point you'll need an API key.
You can get one from the [Victorian Transport Data Exchange](https://data-exchange.vicroads.vic.gov.au/).
Simply follow the directions to sign up, go to 'Products', choose 'Unlimited', and get your key.
Place this key into the `config.json`.
