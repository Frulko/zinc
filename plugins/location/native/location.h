#pragma once
// The provider of a platform: location.macos.mm (Core Location, also iOS through location.ios.mm) defines LOC_BACKEND and includes
// location.host.cpp, which alone has none. The backend reports from any thread through loc_push and loc_fail.

/** 0 undetermined, 1 granted, 2 denied, 3 restricted, 4 services off, 5 no provider. */
int loc_backend_permission(bool ask);
void loc_backend_start(double accuracy, double distance);
void loc_backend_stop();
/** A new fix: latitude, longitude, accuracy, altitude, altitudeAccuracy, speed, heading, timestamp in ms (NaN: unknown). */
void loc_push(const double fix[8]);
/** A failure: its code ("denied", "unavailable") and the provider's message. */
void loc_fail(const char* code, const char* message);
