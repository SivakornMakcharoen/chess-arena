import { CheckersApp } from './checkers/checkers-app.js';

const checkersApp = new CheckersApp();
checkersApp.start();

// This file is loaded as an ES module by Vite, so top-level functions
// are no longer implicitly global. checkers.html still calls these via
// inline onclick="..." attributes.
Object.assign(window, checkersApp.windowHandlers());
