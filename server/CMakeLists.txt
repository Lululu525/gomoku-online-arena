cmake_minimum_required(VERSION 3.10)
project(GomokuArenaV7)

set(CMAKE_CXX_STANDARD 17)

add_executable(gomoku_server
    main.cpp
    HttpServer.cpp
    RoomManager.cpp
    GameRoom.cpp
)

target_link_libraries(gomoku_server ws2_32)
