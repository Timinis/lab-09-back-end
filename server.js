'use strict';

// Require dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const pg = require('pg');
require('dotenv').config();

const client = new pg.Client(process.env.DATABASE_URL);
const app = express();
console.log('access to database');
app.use(cors());
client.connect();

const PORT = process.env.PORT;

//Object Creators to send to front-end

function Location(req, result) {
  this.table_name = 'locations';
  this.search_query = req.query.data;
  this.formatted_query = result.body.results[0].formatted_address;
  this.latitude = result.body.results[0].geometry.location.lat;
  this.longitude = result.body.results[0].geometry.location.lng;
  this.created_at = Date.now();
}

function Weather(day) {
  this.table_name = 'weathers';
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
  this.created_at = Date.now();
}

function Yelp(food) {
  this.name = food.name;
  this.image_url = food.image_url;
  this.price = food.price;
  this.rating = food.rating;
  this.url = food.url;
  this.created_at = Date.now();
}

function Movie(movies) {
  this.title = movies.title;
  this.overview = movies.overview;
  this.average_votes = movies.vote_average;
  this.total_votes = movies.vote_count;
  this.image_url = movies.poster_path;
  this.popularity = movies.popularity;
  this.released_on = movies.release_date;
  this.created_at = Date.now();
}

//Function to check if data exists in SQL

Location.lookupLocation = function(request, response) {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [request.query.data];
  return client
    .query(SQL, values)
    .then(console.log(values, 'this is the values'))
    .then(result => {
      console.log(result, 'this is a SQL returned');
      if (result.rowCount > 0) {
        response.send(result.rows[0]);
      } else {
        displayAndStoreLocation(request, response);
      }
    })
    .catch(console.error);
};

//Functiion to delete sql if data is outdated

//Function to send back sql result if data is not outdated

//Function to store cache

Location.prototype.save = function() {
  console.log(this, 'this is this');
  const SQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id;`;
  const values = [
    this.search_query,
    this.formatted_query,
    this.latitude,
    this.longitude
  ];
  return client
    .query(SQL, values)
    .then(result => {
      this.id = result.rows[0].id;
      return this;
    })
    .catch(console.error);
};

//The function to call API display it and store it

const displayAndStoreLocation = (request, response) => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${
    request.query.data
  }&key=${process.env.GOOGLE_API_KEY}`;
  return superagent
    .get(url)
    .then(result => {
      const locationResult = new Location(request, result);
      console.log(locationResult, 'this is an object');
      locationResult
        .save()
        .then(locationResult => response.send(locationResult));
    })
    .catch(error => handleError(error));
};

const getWeatherAndSave = (request, response) => {
  const url = `https://api.darksky.net/forecast/${
    process.env.DARK_SKY_API_KEY
  }/${request.query.data.latitude},${request.query.data.longitude}`;
  return superagent
    .get(url)
    .then(result => {
      response.send(
        result.body.daily.data.map(element => new Weather(element))
      );
    })
    .catch(error => handleError(error, response));
};

const getYelpAndSave = (request, response) => {
  const url = `https://api.yelp.com/v3/businesses/search?location=${
    request.query.data.search_query
  }`;
  superagent
    .get(url)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      response.send(result.body.businesses.map(element => new Yelp(element)));
    })
    .catch(error => handleError(error, response));
};

const getMoviesAndSave = (request, response) => {
  const url = `https://api.themoviedb.org/3/search/movie/?api_key=${
    process.env.MOVIEDB_API_KEY
  }&language=en-US&page=1&query=${request.query.data.search_query}`;
  superagent
    .get(url)
    .then(result => {
      response.send(result.body.results.map(element => new Movie(element)));
    })
    .catch(error => handleError(error, response));
};

const handleError = (err, res) => {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
};

//Final function to call it all with logic statement

//Use the add listener

app.get('/location', Location.lookupLocation);

app.get('/weather', getWeatherAndSave);

app.get('/yelp', getYelpAndSave);

app.get('/movies', getMoviesAndSave);

//Waiting on Port

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
