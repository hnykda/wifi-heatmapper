/**
 * radius.ts - various algorithms for calculating the radius funcion
 * for a heatmap.
 *
 * All suggested by Claude 3.7 Sonnet
 */

import { SurveyPoint } from "./types";
/**
 * Calculates radius based on average nearest neighbor distance
 */
export function calculateRadiusByDensity(points: SurveyPoint[]): number {
  if (points.length <= 1) return 30; // Default radius if too few points

  let totalDistance = 0;
  let count = 0;

  for (let i = 0; i < points.length; i++) {
    let minDistance = Infinity;
    for (let j = 0; j < points.length; j++) {
      if (i !== j) {
        const distance = Math.sqrt(
          Math.pow(points[i].x - points[j].x, 2) +
            Math.pow(points[i].y - points[j].y, 2),
        );
        minDistance = Math.min(minDistance, distance);
      }
    }
    if (minDistance !== Infinity) {
      totalDistance += minDistance;
      count++;
    }
  }

  // Use 60% of average nearest neighbor distance as radius
  // This creates some overlap between points while maintaining detail
  return count > 0 ? (totalDistance / count) * 0.6 : 30;
}

/**
 * Calculate radius based on bounding box and data point count
 * This is the function currently used in the app
 */
export function calculateRadiusByBoundingBox(points: SurveyPoint[]): number {
  if (points.length === 0) return 30;

  // Find min/max x and y coordinates
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  // Calculate area and point density
  const width = maxX - minX;
  const height = maxY - minY;
  const area = width * height;

  // If all points are at same location, return default
  if (area === 0) return 30;

  // Base radius on the area covered and number of points
  // to ensure reasonable coverage
  return Math.sqrt(area / (points.length * Math.PI)) * 2;
}

/**
 * Calculates radius dynamically based on both density and data distribution
 */
export function calculateOptimalRadius(points: SurveyPoint[]): number {
  if (points.length <= 1) return 30;

  // Get standard deviation of x and y coordinates to understand spread
  let sumX = 0,
    sumY = 0,
    sumX2 = 0,
    sumY2 = 0;

  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumX2 += point.x * point.x;
    sumY2 += point.y * point.y;
  }

  const meanX = sumX / points.length;
  const meanY = sumY / points.length;
  const varX = sumX2 / points.length - meanX * meanX;
  const varY = sumY2 / points.length - meanY * meanY;
  const stdDevX = Math.sqrt(Math.max(0, varX));
  const stdDevY = Math.sqrt(Math.max(0, varY));

  // Calculate density radius
  const densityRadius = calculateRadiusByDensity(points);

  // Calculate uniform spread radius
  const spreadRadius = Math.min(stdDevX, stdDevY) * 0.2;

  // Use the smaller of the two to preserve detail, but with a minimum threshold
  return Math.max(Math.min(densityRadius, spreadRadius), 10);
}
