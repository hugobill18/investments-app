require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');

// Import avec initialisation async
let db = null;
const { dbWrapper, initDb } = require('./db');

// Fonction pour démarrer le serveur
async function startServer() {
  // Initialiser la DB
  await initDb();
  db = dbWrapper;

