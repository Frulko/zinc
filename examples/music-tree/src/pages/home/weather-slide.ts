// ============================================================================
// pages/home/weather-slide.ts — Slide 2: Current weather, 24 h and 7 days
// ============================================================================

import { rrect, gradient, stroke, polygon, drawText, textWidth, fontAscent } from 'zinc:gfx';
import {
  COLOR_TEXT_PRIMARY,
  WEEKDAYS_CAPITALIZED,
} from '../../constants';
import { FONT_WEATHER_TEMP, Fonts } from '../../fonts';
import { DisplayObject } from 'zinc:stage';
import {
  drawCenteredText,
  drawGlyph,
  drawLabel,
} from '../../components/primitives';
import {
  getCurrentWeatherForecast,
  getWeatherErrorMessage,
  getWeatherConditionLabel,
  getWeatherIconName,
  getWeatherSkyGradientColors,
  formatTemperatureDegrees,
} from '../../services/weather-service';

const OUTER_MARGIN = 32;
const CARD_GAP = 20;
const CARD_INNER_PADDING = 24;
const DAILY_ROW_HEIGHT = 44;

function drawTranslucentWeatherCard(x: number, y: number, width: number, height: number): void {
  rrect(x, y, width, height, 20, 0xffffff, 34);
}

function drawVerticallyCenteredText(
  fontId: i32,
  x: number,
  centerY: number,
  text: string,
  alpha: i32 = 255
): void {
  drawText(fontId, x, centerY - fontAscent(fontId) / 2 - 1, text, COLOR_TEXT_PRIMARY, alpha, 0);
}

/**
 * Display-tree node for the carousel's Weather slide.
 */
export class WeatherSlideNode extends DisplayObject {
  constructor() {
    super('WeatherSlide');
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    const forecast = getCurrentWeatherForecast();
    const skyColors = getWeatherSkyGradientColors(
      forecast.isLoaded ? forecast.weatherCode : 0,
      forecast.isLoaded ? forecast.isDaytime : true
    );
    gradient(0, -40, viewWidth, viewHeight + 40, 0, skyColors[0], skyColors[1], true, 255);

    if (!forecast.isLoaded) {
      const errorMessage = getWeatherErrorMessage();
      drawCenteredText(
        Fonts.heading,
        viewWidth / 2,
        viewHeight / 2 - 20,
        errorMessage !== '' ? errorMessage : 'Météo…',
        COLOR_TEXT_PRIMARY
      );
      return;
    }

    const halfCardWidth = (viewWidth - OUTER_MARGIN * 2 - CARD_GAP) / 2;
    const topRowY = 8;
    const topCardHeight =
      CARD_INNER_PADDING +
      forecast.dailyLowTemps.length * DAILY_ROW_HEIGHT +
      CARD_INNER_PADDING -
      8;

    // ---- Left card: Current conditions ----
    const leftCardX = OUTER_MARGIN;
    drawTranslucentWeatherCard(leftCardX, topRowY, halfCardWidth, topCardHeight);
    drawLabel(
      Fonts.title,
      leftCardX + CARD_INNER_PADDING,
      topRowY + CARD_INNER_PADDING,
      forecast.cityName !== '' ? forecast.cityName : 'Ici',
      COLOR_TEXT_PRIMARY,
      halfCardWidth - CARD_INNER_PADDING * 2 - 100
    );
    drawText(
      FONT_WEATHER_TEMP,
      leftCardX + CARD_INNER_PADDING - 6,
      topRowY + 64,
      formatTemperatureDegrees(forecast.currentTemp),
      COLOR_TEXT_PRIMARY,
      255,
      0
    );
    drawGlyph(
      getWeatherIconName(forecast.weatherCode, forecast.isDaytime),
      leftCardX + halfCardWidth - CARD_INNER_PADDING - 92,
      topRowY + CARD_INNER_PADDING + 4,
      92,
      COLOR_TEXT_PRIMARY,
      255,
      1.5
    );
    drawLabel(
      Fonts.body,
      leftCardX + CARD_INNER_PADDING,
      topRowY + 200,
      getWeatherConditionLabel(forecast.weatherCode),
      COLOR_TEXT_PRIMARY,
      halfCardWidth - CARD_INNER_PADDING * 2
    );
    drawLabel(
      Fonts.label,
      leftCardX + CARD_INNER_PADDING,
      topRowY + 232,
      `Max. ${formatTemperatureDegrees(forecast.dailyHighTemps[0])}   Min. ${formatTemperatureDegrees(
        forecast.dailyLowTemps[0]
      )}`,
      COLOR_TEXT_PRIMARY,
      halfCardWidth - CARD_INNER_PADDING * 2,
      220
    );
    drawLabel(
      Fonts.small,
      leftCardX + CARD_INNER_PADDING,
      topRowY + topCardHeight - CARD_INNER_PADDING - fontAscent(Fonts.small) - 2,
      `Ressenti ${formatTemperatureDegrees(forecast.apparentTemp)}  ·  Vent ${Math.round(
        forecast.windSpeedKmh
      )} km/h  ·  Humidité ${Math.round(forecast.humidityPercent)} %`,
      COLOR_TEXT_PRIMARY,
      halfCardWidth - CARD_INNER_PADDING * 2,
      200
    );

    // ---- Right card: 7-day forecast ----
    const rightCardX = OUTER_MARGIN + halfCardWidth + CARD_GAP;
    drawTranslucentWeatherCard(rightCardX, topRowY, halfCardWidth, topCardHeight);

    let weekMinTemp = 1e9;
    let weekMaxTemp = -1e9;
    for (let dayIndex = 0; dayIndex < forecast.dailyLowTemps.length; dayIndex++) {
      weekMinTemp = Math.min(weekMinTemp, forecast.dailyLowTemps[dayIndex]);
      weekMaxTemp = Math.max(weekMaxTemp, forecast.dailyHighTemps[dayIndex]);
    }
    const weekTempSpan = Math.max(1, weekMaxTemp - weekMinTemp);
    const tempSampleWidth = textWidth(Fonts.label, '-00°', 0);
    const barStartX = rightCardX + CARD_INNER_PADDING + 64 + 40 + tempSampleWidth + 12;
    const barMaxWidth =
      rightCardX + halfCardWidth - CARD_INNER_PADDING - tempSampleWidth - 12 - barStartX;

    for (let dayIndex = 0; dayIndex < forecast.dailyLowTemps.length; dayIndex++) {
      const rowCenterY =
        topRowY + CARD_INNER_PADDING - 4 + dayIndex * DAILY_ROW_HEIGHT + DAILY_ROW_HEIGHT / 2;
      if (dayIndex > 0) {
        rrect(
          rightCardX + CARD_INNER_PADDING,
          rowCenterY - DAILY_ROW_HEIGHT / 2,
          halfCardWidth - CARD_INNER_PADDING * 2,
          1,
          0,
          0xffffff,
          40
        );
      }

      const dayLabel =
        dayIndex === 0
          ? 'Auj.'
          : WEEKDAYS_CAPITALIZED[(new Date().getDay() + dayIndex) % 7];
      drawVerticallyCenteredText(Fonts.bodyBold, rightCardX + CARD_INNER_PADDING, rowCenterY, dayLabel);

      drawGlyph(
        getWeatherIconName(forecast.dailyWeatherCodes[dayIndex], true),
        rightCardX + CARD_INNER_PADDING + 64,
        rowCenterY - 13,
        26,
        COLOR_TEXT_PRIMARY,
        255,
        1.8
      );

      const lowLabel = formatTemperatureDegrees(forecast.dailyLowTemps[dayIndex]);
      drawVerticallyCenteredText(
        Fonts.label,
        barStartX - 12 - textWidth(Fonts.label, lowLabel, 0),
        rowCenterY,
        lowLabel,
        190
      );

      rrect(barStartX, rowCenterY - 3, barMaxWidth, 6, 3, 0x000000, 50);
      const rangeStartX =
        barStartX + ((forecast.dailyLowTemps[dayIndex] - weekMinTemp) / weekTempSpan) * barMaxWidth;
      const rangeEndX =
        barStartX +
        ((forecast.dailyHighTemps[dayIndex] - weekMinTemp) / weekTempSpan) * barMaxWidth;
      gradient(
        rangeStartX,
        rowCenterY - 3,
        Math.max(6, rangeEndX - rangeStartX),
        6,
        3,
        0x7fd3ff,
        0xffc94d,
        false,
        255
      );
      drawVerticallyCenteredText(
        Fonts.label,
        barStartX + barMaxWidth + 12,
        rowCenterY,
        formatTemperatureDegrees(forecast.dailyHighTemps[dayIndex])
      );
    }

    // ---- Bottom card: Temperature curve and rain over 24 hours ----
    const bottomCardY = topRowY + topCardHeight + CARD_GAP;
    const bottomCardHeight = viewHeight - bottomCardY - OUTER_MARGIN + 8;
    drawTranslucentWeatherCard(
      OUTER_MARGIN,
      bottomCardY,
      viewWidth - OUTER_MARGIN * 2,
      bottomCardHeight
    );

    const hoursCount = forecast.hourlyTemps.length;
    const graphStartX = OUTER_MARGIN + CARD_INNER_PADDING + 16;
    const graphWidth = viewWidth - OUTER_MARGIN * 2 - CARD_INNER_PADDING * 2 - 32;
    const hourLabelsY =
      bottomCardY + bottomCardHeight - CARD_INNER_PADDING - fontAscent(Fonts.tiny);
    const rainBarsBottomY = hourLabelsY - 12;
    const rainBarsMaxHeight = 26;
    const curveTopY = bottomCardY + CARD_INNER_PADDING + 28;
    const curveHeight = rainBarsBottomY - rainBarsMaxHeight - 16 - curveTopY;

    let minHourlyTemp = 1e9;
    let maxHourlyTemp = -1e9;
    for (let index = 0; index < hoursCount; index++) {
      minHourlyTemp = Math.min(minHourlyTemp, forecast.hourlyTemps[index]);
      maxHourlyTemp = Math.max(maxHourlyTemp, forecast.hourlyTemps[index]);
    }
    const hourlyTempSpan = Math.max(1, maxHourlyTemp - minHourlyTemp);

    const strokePoints: number[] = [];
    const fillPolygonPoints: number[] = [];
    for (let index = 0; index < hoursCount; index++) {
      const pointX = graphStartX + (index / (hoursCount - 1)) * graphWidth;
      const pointY =
        curveTopY +
        (1 - (forecast.hourlyTemps[index] - minHourlyTemp) / hourlyTempSpan) * curveHeight;
      strokePoints.push(pointX);
      strokePoints.push(pointY);
      fillPolygonPoints.push(pointX);
      fillPolygonPoints.push(pointY);
    }
    fillPolygonPoints.push(graphStartX + graphWidth);
    fillPolygonPoints.push(curveTopY + curveHeight);
    fillPolygonPoints.push(graphStartX);
    fillPolygonPoints.push(curveTopY + curveHeight);

    polygon(fillPolygonPoints, 0xffffff, 40);
    stroke(strokePoints, 4, 0xffffff, 255, false);

    for (let index = 0; index < hoursCount; index++) {
      const pointX = graphStartX + (index / (hoursCount - 1)) * graphWidth;
      const rainProbability = forecast.hourlyRainProbabilities[index] / 100;
      if (rainProbability > 0) {
        const barHeight = Math.max(3, rainBarsMaxHeight * rainProbability);
        rrect(
          pointX - 4,
          rainBarsBottomY - rainBarsMaxHeight * rainProbability,
          8,
          barHeight,
          3,
          0x7fd3ff,
          230
        );
      }
    }

    for (let index = 0; index < hoursCount; index += 3) {
      const pointX = graphStartX + (index / (hoursCount - 1)) * graphWidth;
      const pointY =
        curveTopY +
        (1 - (forecast.hourlyTemps[index] - minHourlyTemp) / hourlyTempSpan) * curveHeight;
      rrect(pointX - 5, pointY - 5, 10, 10, 5, 0xffffff, 255);
      drawCenteredText(
        Fonts.smallBold,
        pointX,
        pointY - 30,
        formatTemperatureDegrees(forecast.hourlyTemps[index]),
        COLOR_TEXT_PRIMARY
      );
      drawCenteredText(
        Fonts.tiny,
        pointX,
        hourLabelsY,
        forecast.hourlyLabels[index],
        COLOR_TEXT_PRIMARY,
        220
      );
    }
  }
}
