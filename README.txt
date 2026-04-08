Gomoku Arena V7 Final

Compile:
g++ main.cpp HttpServer.cpp RoomManager.cpp GameRoom.cpp -o gomoku_server -std=c++17 -lws2_32

Run:
gomoku_server.exe 8080 ../web

Open:
http://localhost:8080
