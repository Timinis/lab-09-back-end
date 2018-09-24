'use strict';

// Require dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const pg = require('pg');
require('dotenv').config();

const client = new pg.Client(process.env.DATABASE_URL);
const app = express();
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
  this.table_name = 'restaurants';
  this.name = food.name;
  this.image_url = food.image_url;
  this.price = food.price;
  this.rating = food.rating;
  this.url = food.url;
  this.created_at = Date.now();
}

function Movie(movies) {
  this.table_name = 'movies';
  this.title = movies.title;
  this.overview = movies.overview;
  this.average_votes = movies.vote_average;
  this.total_votes = movies.vote_count;
  this.image_url = `https://image.tmdb.org/t/p/w500${movies.poster_path}`;
  this.popularity = movies.popularity;
  this.released_on = movies.release_date;
  this.created_at = Date.now();
}

function Meetup(meetup) {
  this.table_name = 'meetups';
  this.name = meetup.name;
  this.link = meetup.link;
  this.host = meetup.group.name;
  this.created_at = Date.now();
  this.creation_date = meetup.local_date;
}

function Trails(trail) {
  this.table_name = 'trails';
  this.trail_url = trail.url;
  this.name = trail.name;
  this.location = trail.location;
  this.length = trail.length;
  this.condition_date = trail.conditionDate.split(' ')[0];
  this.condition_time = trail.conditionDate.split(' ')[1];
  this.conditions = trail.conditionStatus;
  this.stars = trail.stars;
  this.star_votes = trail.starVotes;
  this.summary = trail.summary;
}
//Function to check if data exists in SQL and send it to client side

Location.lookupLocation = function(request, response) {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [request.query.data];
  return client
    .query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        response.send(result.rows[0]);
      } else {
        displayAndStoreLocation(request, response);
      }
    })
    .catch(console.error);
};

const lookup = function(request, response, table_name, cacheHit, cacheMiss) {
  const SQL = `SELECT * FROM ${table_name} WHERE location_id=$1;`;
  const values = [request.query.data.id];
  console.log(SQL, 'this is SQL');
  console.log(values, 'this is values');
  client
    .query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        cacheHit(request, response, result.rows);
      } else {
        cacheMiss(request, response);
      }
    })
    .catch(console.error);
};

//Functiion to delete sql if data is outdated
const deleteByLocationId = (table, city) => {
  const SQL = `DELETE from ${table} WHERE location_id=${city};`;
  client
    .query(SQL)
    .then(result => {
      return result;
    })
    .catch(console.error);
};

//Cachehit function
const cacheHitWeather = (request, response, resultsArray) => {
  let ageOfResultsInMinutes =
    (Date.now() - resultsArray[0].created_at) / (1000 * 60);
  if (ageOfResultsInMinutes > 30) {
    deleteByLocationId('weathers', request.query.data.id);
    getWeatherAndSave(request, response);
  } else {
    response.send(resultsArray);
  }
};

const cacheHitRestaurants = (request, response, resultsArray) => {
  let ageOfResultsInMinutes =
    (Date.now() - resultsArray[0].created_at) / (1000 * 60);
  if (ageOfResultsInMinutes > 10080) {
    deleteByLocationId('restaurants', request.query.data.id);
    getYelpAndSave(request, response);
  } else {
    response.send(resultsArray);
  }
};

const cacheHitMovie = (request, response, resultsArray) => {
  let ageOfResultsInMinutes =
    (Date.now() - resultsArray[0].created_at) / (1000 * 60);
  if (ageOfResultsInMinutes > 10080 * 2) {
    deleteByLocationId('movies', request.query.data.id);
    getYelpAndSave(request, response);
  } else {
    response.send(resultsArray);
  }
};

const cacheHitMeetup = (request, response, resultsArray) => {
  let ageOfResultsInMinutes =
    (Date.now() - resultsArray[0].created_at) / (1000 * 60);
  if (ageOfResultsInMinutes > 60 * 24) {
    deleteByLocationId('meetup', request.query.data.id);
    getYelpAndSave(request, response);
  } else {
    response.send(resultsArray);
  }
};

const cacheHitTrails = (request, response, resultsArray) => {
  let ageOfResultsInMinutes =
    (Date.now() - resultsArray[0].created_at) / (1000 * 60);
  if (ageOfResultsInMinutes > 60 * 24) {
    deleteByLocationId('trails', request.query.data.id);
    getTrailsAndSave(request, response);
  } else {
    response.send(resultsArray);
  }
};
//Function to send back sql result if data is not outdated

//Function to store cache

Location.prototype.save = function() {
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

Weather.prototype.save = function(location_id) {
  const SQL = `INSERT INTO ${
    this.table_name
  } (forecast, time, created_at, location_id) VALUES ($1, $2, $3, $4);`;
  const values = [this.forecast, this.time, this.created_at, location_id];
  client.query(SQL, values).catch(console.error);
};

Yelp.prototype.save = function(location_id) {
  const SQL = `INSERT INTO ${
    this.table_name
  } (name, image_url, price, rating, url, created_at, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7);`;
  const values = [
    this.name,
    this.image_url,
    this.price,
    this.rating,
    this.url,
    this.created_at,
    location_id
  ];
  client.query(SQL, values).catch(console.error);
};

Movie.prototype.save = function(location_id) {
  const SQL = `INSERT INTO ${
    this.table_name
  } (title, overview, average_votes, total_votes, image_url, popularity, released_on, created_at, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`;
  const values = [
    this.title,
    this.overview,
    this.average_votes,
    this.total_votes,
    this.image_url,
    this.popularity,
    this.released_on,
    this.created_at,
    location_id
  ];
  client.query(SQL, values).catch(console.error);
};

Meetup.prototype.save = function(location_id) {
  const SQL = `INSERT INTO ${
    this.table_name
  } (name, link, host, created_at, creation_date, location_id) VALUES ($1, $2, $3, $4, $5, $6);`;
  const values = [
    this.name,
    this.link,
    this.host,
    this.created_at,
    this.creation_date,
    location_id
  ];
  client.query(SQL, values).catch(console.error);
};

Trails.prototype.save = function(location_id) {
  const SQL = `INSERT INTO ${
    this.table_name
  } (trail_url, name, location, length, condition_date, condition_time, conditions, stars, star_votes, summary, location_id) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`;
  const values = [
    this.trail_url,
    this.name,
    this.location,
    this.length,
    this.condition_date,
    this.condition_time,
    this.conditions,
    this.stars,
    this.star_votes,
    this.summary,
    location_id
  ];
  client.query(SQL, values).catch(console.error);
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
      locationResult
        .save()
        .then(locationResult => response.send(locationResult))
        .catch(console.error);
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
      const weatherResult = result.body.daily.data.map(element => {
        const summary = new Weather(element);
        summary.save(request.query.data.id);
        return summary;
      });
      response.send(weatherResult);
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
      const yelpResult = result.body.businesses.map(element => {
        const summary = new Yelp(element);
        summary.save(request.query.data.id);
        return summary;
      });
      response.send(yelpResult);
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
      const movieReult = result.body.results.map(element => {
        const summary = new Movie(element);
        summary.save(request.query.data.id);
        return summary;
      });
      response.send(movieReult);
    })
    .catch(error => handleError(error, response));
};

const getMeetupAndSave = (request, response) => {
  const url = `https://api.meetup.com/find/upcoming_events?&sign=true&photo-host=public&page=20&key=${
    process.env.MEETUP_API_KEY
  }&lat=${request.query.data.latitude}&lon=${request.query.data.longitude}`;
  superagent
    .get(url)
    .then(result => {
      const meetupResult = result.body.events.map(element => {
        const summary = new Meetup(element);
        summary.save(request.query.data.id);
        return summary;
      });
      response.send(meetupResult);
    })
    .catch(error => handleError(error, response));
};

const getTrailsAndSave = (request, response) => {
  const url = `https://www.hikingproject.com/data/get-trails?lat=${
    request.query.data.latitude
  }&lon=${request.query.data.longitude}&key=${
    process.env.TRAILS_API_KEY
  }&maxDistance=10`;
  superagent
    .get(url)
    .then(result => {
      const trailResult = result.body.trails.map(element => {
        const summary = new Trails(element);
        summary.save(request.query.data.id);
        return summary;
      });
      response.send(trailResult);
    })
    .catch(error => handleError(error, response));
};
const handleError = (err, res) => {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
};

//Use the add listener

app.get('/location', Location.lookupLocation);

app.get('/weather', (request, response) =>
  lookup(request, response, 'weathers', cacheHitWeather, getWeatherAndSave)
);

app.get('/yelp', (request, response) => {
  lookup(request, response, 'restaurants', cacheHitRestaurants, getYelpAndSave);
});

app.get('/movies', (request, response) => {
  lookup(request, response, 'movies', cacheHitMovie, getMoviesAndSave);
});

app.get('/meetups', (request, response) => {
  lookup(request, response, 'meetups', cacheHitMeetup, getMeetupAndSave);
});

app.get('/trails', (request, response) => {
  lookup(request, response, 'trails', cacheHitTrails, getTrailsAndSave);
});
//Waiting on Port

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
