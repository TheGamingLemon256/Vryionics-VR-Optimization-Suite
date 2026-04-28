@echo off
:: Navigate to the update-server directory
cd /d "G:\Claude Projects\Vryionics VR Optimization Suite\update-server"

:: Open the dashboard in the default browser
start http://localhost:4600

:: Start the publisher
node server.js

pause
