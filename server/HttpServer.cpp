/*****************************************************************//**
 * \file   HttpServer.cpp
 * \brief  HTTP server implementation for the browser-based Gomoku Arena project.
 * 
 * \author B11201116
 * \date   2026/4/1
 *********************************************************************/

#include "HttpServer.h"

#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib")

namespace
{
    std::string getRequestLine(const std::string& rawRequest)
    {
        const std::size_t position = rawRequest.find("\r\n");
        return (position == std::string::npos) ? rawRequest : rawRequest.substr(0, position);
    }

    std::string getBody(const std::string& rawRequest)
    {
        const std::string separator = "\r\n\r\n";
        const std::size_t position = rawRequest.find(separator);

        if (position == std::string::npos)
        {
            return "";
        }

        return rawRequest.substr(position + separator.size());
    }

    std::string stripQueryString(const std::string& path)
    {
        const std::size_t position = path.find('?');

        if (position == std::string::npos)
        {
            return path;
        }

        return path.substr(0, position);
    }

    std::string getContentType(const std::string& path)
    {
        if (path.find(".html") != std::string::npos)
        {
            return "text/html; charset=utf-8";
        }

        if (path.find(".css") != std::string::npos)
        {
            return "text/css; charset=utf-8";
        }

        if (path.find(".js") != std::string::npos)
        {
            return "application/javascript; charset=utf-8";
        }

        if (path.find(".png") != std::string::npos)
        {
            return "image/png";
        }

        if (path.find(".jpg") != std::string::npos || path.find(".jpeg") != std::string::npos)
        {
            return "image/jpeg";
        }

        if (path.find(".webp") != std::string::npos)
        {
            return "image/webp";
        }

        return "text/plain; charset=utf-8";
    }
}

/**
 * \brief Construct a server on the given port and web root.
 * 
 * \param port Listening port
 * \param webRoot Static web root directory
 */
HttpServer::HttpServer(int port, const std::string& webRoot)
    : m_port(port),
      m_webRoot(webRoot)
{
}

/**
 * \brief Destroy the server and release socket resources.
 */
HttpServer::~HttpServer()
{
    if (m_serverSocket != -1)
    {
        closesocket(m_serverSocket);
    }

    WSACleanup();
}

/**
 * \brief Start listening on the configured port.
 * 
 * \return True if startup succeeds
 */
bool HttpServer::start()
{
    WSADATA wsaData;

    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
    {
        std::cerr << "WSAStartup failed." << std::endl;
        return false;
    }

    m_serverSocket = static_cast<int>(socket(AF_INET, SOCK_STREAM, IPPROTO_TCP));

    if (m_serverSocket == -1)
    {
        std::cerr << "socket() failed." << std::endl;
        return false;
    }

    int option = 1;
    setsockopt(m_serverSocket, SOL_SOCKET, SO_REUSEADDR,
               reinterpret_cast<const char*>(&option), sizeof(option));

    sockaddr_in serverAddress{};
    serverAddress.sin_family = AF_INET;
    serverAddress.sin_addr.s_addr = htonl(INADDR_ANY);
    serverAddress.sin_port = htons(static_cast<u_short>(m_port));

    if (bind(m_serverSocket, reinterpret_cast<sockaddr*>(&serverAddress), sizeof(serverAddress)) == SOCKET_ERROR)
    {
        std::cerr << "bind() failed." << std::endl;
        return false;
    }

    if (listen(m_serverSocket, SOMAXCONN) == SOCKET_ERROR)
    {
        std::cerr << "listen() failed." << std::endl;
        return false;
    }

    std::cout << "Gomoku HTTP server is running on http://localhost:" << m_port << std::endl;
    return true;
}

/**
 * \brief Enter the blocking request loop.
 */
void HttpServer::run()
{
    while (true)
    {
        sockaddr_in clientAddress{};
        int clientLength = sizeof(clientAddress);

        const SOCKET clientSocket = accept(
            m_serverSocket,
            reinterpret_cast<sockaddr*>(&clientAddress),
            &clientLength);

        if (clientSocket == INVALID_SOCKET)
        {
            continue;
        }

        char buffer[16384];
        const int bytesReceived = recv(clientSocket, buffer, sizeof(buffer), 0);

        if (bytesReceived > 0)
        {
            const std::string request(buffer, buffer + bytesReceived);
            const std::string response = handleRequest(request);
            send(clientSocket, response.c_str(), static_cast<int>(response.size()), 0);
        }

        closesocket(clientSocket);
    }
}

/**
 * \brief Parse and dispatch one incoming HTTP request.
 * 
 * \param rawRequest Full raw HTTP request text
 * \return Complete HTTP response text
 */
std::string HttpServer::handleRequest(const std::string& rawRequest)
{
    const std::string requestLine = getRequestLine(rawRequest);
    std::istringstream lineStream(requestLine);

    std::string method;
    std::string rawPath;
    std::string version;

    lineStream >> method >> rawPath >> version;

    const std::string cleanPath = stripQueryString(rawPath);
    const std::string body = getBody(rawRequest);

    if (method == "GET")
    {
        if (cleanPath == "/")
        {
            return handleStaticFile("/index.html");
        }

        if (cleanPath == "/index.html" || cleanPath == "/room.html" ||
            cleanPath == "/style.css" || cleanPath == "/app.js" ||
            cleanPath.rfind("/assets/", 0) == 0)
        {
            return handleStaticFile(cleanPath);
        }
    }

    if (method == "POST" && cleanPath == "/api/create_room")
    {
        return handleCreateRoom(body);
    }

    if (method == "POST" && cleanPath == "/api/join_room")
    {
        return handleJoinRoom(body);
    }

    if (method == "GET" && cleanPath == "/api/status")
    {
        return handleStatus(rawPath);
    }

    if (method == "POST" && cleanPath == "/api/move")
    {
        return handleMove(body);
    }

    if (method == "POST" && cleanPath == "/api/restart_request")
    {
        return handleRestartRequest(body);
    }

    if (method == "POST" && cleanPath == "/api/restart_respond")
    {
        return handleRestartRespond(body);
    }

    if (method == "POST" && cleanPath == "/api/undo_request")
    {
        return handleUndoRequest(body);
    }

    if (method == "POST" && cleanPath == "/api/undo_respond")
    {
        return handleUndoRespond(body);
    }

    if (method == "POST" && cleanPath == "/api/leave_room")
    {
        return handleLeaveRoom(body);
    }

    return makeHttpResponse("404 Not Found", "application/json", jsonMessage("Not found"));
}

/**
 * \brief Serve one static file under the web root.
 * 
 * \param path Relative static file path
 * \return Complete HTTP response text
 */
std::string HttpServer::handleStaticFile(const std::string& path)
{
    const std::string fullPath = m_webRoot + path;
    std::ifstream input(fullPath, std::ios::binary);

    if (!input)
    {
        return makeHttpResponse("404 Not Found", "text/plain", "File not found");
    }

    std::ostringstream output;
    output << input.rdbuf();

    return makeHttpResponse("200 OK", getContentType(path), output.str());
}

/**
 * \brief Create one room and return room/player data as JSON.
 * 
 * \param body JSON request body
 * \return Complete HTTP response text
 */
std::string HttpServer::handleCreateRoom(const std::string& body)
{
    const std::string playerName = getJsonString(body, "playerName");
    const std::string avatarId = getJsonString(body, "avatarId");

    RoomSettings settings;
    settings.timerEnabled = getJsonBool(body, "timerEnabled", false);
    settings.turnSeconds = getJsonInt(body, "turnSeconds", 15);
    settings.undoEnabled = getJsonBool(body, "undoEnabled", true);

    std::string roomId;
    PlayerInfo createdPlayer;
    m_roomManager.createRoom(playerName, avatarId, settings, roomId, createdPlayer);

    std::ostringstream json;
    json << "{"
         << "\"ok\":true,"
         << "\"roomId\":\"" << escapeJson(roomId) << "\","
         << "\"playerToken\":\"" << escapeJson(createdPlayer.token) << "\","
         << "\"color\":" << createdPlayer.color
         << "}";

    return makeHttpResponse("200 OK", "application/json", json.str());
}

/**
 * \brief Join one existing room.
 * 
 * \param body JSON request body
 * \return Complete HTTP response text
 */
std::string HttpServer::handleJoinRoom(const std::string& body)
{
    const std::string roomId = getJsonString(body, "roomId");
    const std::string playerName = getJsonString(body, "playerName");
    const std::string avatarId = getJsonString(body, "avatarId");

    const std::optional<PlayerInfo> joinedPlayer = m_roomManager.joinRoom(roomId, playerName, avatarId);

    if (!joinedPlayer.has_value())
    {
        return makeHttpResponse("400 Bad Request", "application/json",
                                jsonMessage("Room not found or room is full."));
    }

    std::ostringstream json;
    json << "{"
         << "\"ok\":true,"
         << "\"roomId\":\"" << escapeJson(roomId) << "\","
         << "\"playerToken\":\"" << escapeJson(joinedPlayer->token) << "\","
         << "\"color\":" << joinedPlayer->color
         << "}";

    return makeHttpResponse("200 OK", "application/json", json.str());
}

/**
 * \brief Return one room snapshot.
 * 
 * \param path Request path with query string
 * \return Complete HTTP response text
 */
std::string HttpServer::handleStatus(const std::string& path)
{
    const std::string roomId = getQueryValue(path, "roomId");
    const std::string playerToken = getQueryValue(path, "playerToken");

    std::shared_ptr<GameRoom> room = m_roomManager.findRoom(roomId);

    if (room == nullptr)
    {
        return makeHttpResponse("404 Not Found", "application/json", jsonMessage("Room not found."));
    }

    return makeHttpResponse("200 OK", "application/json",
                            roomSnapshotToJson(room->getSnapshot(), playerToken));
}

/**
 * \brief Apply one move request.
 * 
 * \param body JSON request body
 * \return Complete HTTP response text
 */
std::string HttpServer::handleMove(const std::string& body)
{
    const std::string roomId = getJsonString(body, "roomId");
    const std::string playerToken = getJsonString(body, "playerToken");
    const int row = getJsonInt(body, "row", -1);
    const int col = getJsonInt(body, "col", -1);

    std::shared_ptr<GameRoom> room = m_roomManager.findRoom(roomId);

    if (room == nullptr)
    {
        return makeHttpResponse("404 Not Found", "application/json", jsonMessage("Room not found."));
    }

    std::string errorMessage;

    if (!room->placeMove(playerToken, row, col, errorMessage))
    {
        return makeHttpResponse("400 Bad Request", "application/json", jsonMessage(errorMessage));
    }

    return makeHttpResponse("200 OK", "application/json", jsonMessage("Move accepted.", true));
}

/**
 * \brief Forward one restart request.
 * 
 * \param body JSON request body
 * \return Complete HTTP response text
 */
std::string HttpServer::handleRestartRequest(const std::string& body)
{
    const std::string roomId = getJsonString(body, "roomId");
    const std::string playerToken = getJsonString(body, "playerToken");

    std::shared_ptr<GameRoom> room = m_roomManager.findRoom(roomId);

    if (room == nullptr)
    {
        return makeHttpResponse("404 Not Found", "application/json", jsonMessage("Room not found."));
    }

    room->requestRestart(playerToken);
    return makeHttpResponse("200 OK", "application/json", jsonMessage("Restart request sent.", true));
}

/**
 * \brief Forward one restart response.
 * 
 * \param body JSON request body
 * \return Complete HTTP response text
 */
std::string HttpServer::handleRestartRespond(const std::string& body)
{
    const std::string roomId = getJsonString(body, "roomId");
    const std::string playerToken = getJsonString(body, "playerToken");
    const bool accepted = getJsonBool(body, "accepted", false);

    std::shared_ptr<GameRoom> room = m_roomManager.findRoom(roomId);

    if (room == nullptr)
    {
        return makeHttpResponse("404 Not Found", "application/json", jsonMessage("Room not found."));
    }

    room->respondRestart(playerToken, accepted);
    return makeHttpResponse("200 OK", "application/json", jsonMessage("Restart response recorded.", true));
}

/**
 * \brief Forward one undo request.
 * 
 * \param body JSON request body
 * \return Complete HTTP response text
 */
std::string HttpServer::handleUndoRequest(const std::string& body)
{
    const std::string roomId = getJsonString(body, "roomId");
    const std::string playerToken = getJsonString(body, "playerToken");

    std::shared_ptr<GameRoom> room = m_roomManager.findRoom(roomId);

    if (room == nullptr)
    {
        return makeHttpResponse("404 Not Found", "application/json", jsonMessage("Room not found."));
    }

    std::string errorMessage;

    if (!room->requestUndo(playerToken, errorMessage))
    {
        return makeHttpResponse("400 Bad Request", "application/json", jsonMessage(errorMessage));
    }

    return makeHttpResponse("200 OK", "application/json", jsonMessage("Undo request sent.", true));
}

/**
 * \brief Forward one undo response.
 * 
 * \param body JSON request body
 * \return Complete HTTP response text
 */
std::string HttpServer::handleUndoRespond(const std::string& body)
{
    const std::string roomId = getJsonString(body, "roomId");
    const std::string playerToken = getJsonString(body, "playerToken");
    const bool accepted = getJsonBool(body, "accepted", false);

    std::shared_ptr<GameRoom> room = m_roomManager.findRoom(roomId);

    if (room == nullptr)
    {
        return makeHttpResponse("404 Not Found", "application/json", jsonMessage("Room not found."));
    }

    room->respondUndo(playerToken, accepted);
    return makeHttpResponse("200 OK", "application/json", jsonMessage("Undo response recorded.", true));
}

/**
 * \brief Remove one player from a room.
 * 
 * \param body JSON request body
 * \return Complete HTTP response text
 */
std::string HttpServer::handleLeaveRoom(const std::string& body)
{
    const std::string roomId = getJsonString(body, "roomId");
    const std::string playerToken = getJsonString(body, "playerToken");

    m_roomManager.leaveRoom(roomId, playerToken);
    return makeHttpResponse("200 OK", "application/json", jsonMessage("Player left the room.", true));
}

/**
 * \brief Build a full HTTP response string.
 * 
 * \param status HTTP status line value
 * \param contentType HTTP content type
 * \param body Response body text
 * \return Complete HTTP response text
 */
std::string HttpServer::makeHttpResponse(const std::string& status,
                                         const std::string& contentType,
                                         const std::string& body) const
{
    std::ostringstream response;
    response << "HTTP/1.1 " << status << "\r\n"
             << "Content-Type: " << contentType << "\r\n"
             << "Content-Length: " << body.size() << "\r\n"
             << "Access-Control-Allow-Origin: *\r\n"
             << "Connection: close\r\n\r\n"
             << body;

    return response.str();
}

/**
 * \brief Build a simple JSON message response body.
 * 
 * \param message Human readable message
 * \param ok Boolean success value
 * \return JSON text
 */
std::string HttpServer::jsonMessage(const std::string& message, bool ok) const
{
    std::ostringstream json;
    json << "{"
         << "\"ok\":" << (ok ? "true" : "false") << ","
         << "\"message\":\"" << escapeJson(message) << "\""
         << "}";

    return json.str();
}

/**
 * \brief Convert one room snapshot into JSON.
 * 
 * \param snapshot Source snapshot
 * \param viewerToken Viewer token for token-dependent values
 * \return JSON text
 */
std::string HttpServer::roomSnapshotToJson(const RoomSnapshot& snapshot, const std::string& viewerToken) const
{
    std::shared_ptr<GameRoom> room = m_roomManager.findRoom(snapshot.roomId);
    const int viewerColor = (room != nullptr) ? room->getPlayerColor(viewerToken) : NONE;
    const bool canUndoForViewer = (room != nullptr) ? room->canPlayerRequestUndo(viewerToken) : false;

    std::ostringstream json;
    json << "{"
         << "\"ok\":true,"
         << "\"roomId\":\"" << escapeJson(snapshot.roomId) << "\","
         << "\"blackName\":\"" << escapeJson(snapshot.blackName) << "\","
         << "\"whiteName\":\"" << escapeJson(snapshot.whiteName) << "\","
         << "\"blackAvatarId\":\"" << escapeJson(snapshot.blackAvatarId) << "\","
         << "\"whiteAvatarId\":\"" << escapeJson(snapshot.whiteAvatarId) << "\","
         << "\"hasBlack\":" << (snapshot.hasBlack ? "true" : "false") << ","
         << "\"hasWhite\":" << (snapshot.hasWhite ? "true" : "false") << ","
         << "\"currentPlayer\":" << snapshot.currentPlayer << ","
         << "\"winner\":" << snapshot.winner << ","
         << "\"gameOver\":" << (snapshot.gameOver ? "true" : "false") << ","
         << "\"timerEnabled\":" << (snapshot.timerEnabled ? "true" : "false") << ","
         << "\"turnSeconds\":" << snapshot.turnSeconds << ","
         << "\"remainingSeconds\":" << snapshot.remainingSeconds << ","
         << "\"restartRequestedByBlack\":" << (snapshot.restartRequestedByBlack ? "true" : "false") << ","
         << "\"restartRequestedByWhite\":" << (snapshot.restartRequestedByWhite ? "true" : "false") << ","
         << "\"undoEnabled\":" << (snapshot.undoEnabled ? "true" : "false") << ","
         << "\"undoRequestedByBlack\":" << (snapshot.undoRequestedByBlack ? "true" : "false") << ","
         << "\"undoRequestedByWhite\":" << (snapshot.undoRequestedByWhite ? "true" : "false") << ","
         << "\"replayAllowed\":" << (snapshot.replayAllowed ? "true" : "false") << ","
         << "\"notice\":\"" << escapeJson(snapshot.notice) << "\","
         << "\"lastMoveRow\":" << snapshot.lastMoveRow << ","
         << "\"lastMoveCol\":" << snapshot.lastMoveCol << ","
         << "\"viewerColor\":" << viewerColor << ","
         << "\"canUndoForViewer\":" << (canUndoForViewer ? "true" : "false") << ",";

    json << "\"board\":[";
    for (int row = 0; row < BOARD_SIZE; ++row)
    {
        json << "[";
        for (int col = 0; col < BOARD_SIZE; ++col)
        {
            json << snapshot.board[row][col];
            if (col != BOARD_SIZE - 1)
            {
                json << ",";
            }
        }
        json << "]";
        if (row != BOARD_SIZE - 1)
        {
            json << ",";
        }
    }
    json << "],";

    json << "\"history\":[";
    for (std::size_t index = 0; index < snapshot.history.size(); ++index)
    {
        const Move& move = snapshot.history[index];
        json << "{"
             << "\"row\":" << move.row << ","
             << "\"col\":" << move.col << ","
             << "\"color\":" << move.color
             << "}";
        if (index + 1 != snapshot.history.size())
        {
            json << ",";
        }
    }
    json << "]";

    json << "}";

    return json.str();
}

/**
 * \brief Read a query parameter from a URL path.
 * 
 * \param path Full request path with optional query string
 * \param key Query parameter key
 * \return Decoded query value
 */
std::string HttpServer::getQueryValue(const std::string& path, const std::string& key) const
{
    const std::size_t questionPosition = path.find('?');

    if (questionPosition == std::string::npos)
    {
        return "";
    }

    const std::string queryString = path.substr(questionPosition + 1);
    std::stringstream queryStream(queryString);
    std::string pair;

    while (std::getline(queryStream, pair, '&'))
    {
        const std::size_t equalPosition = pair.find('=');

        if (equalPosition == std::string::npos)
        {
            continue;
        }

        const std::string currentKey = pair.substr(0, equalPosition);
        const std::string currentValue = pair.substr(equalPosition + 1);

        if (currentKey == key)
        {
            return urlDecode(currentValue);
        }
    }

    return "";
}

/**
 * \brief Read a string value from a very small JSON body.
 * 
 * \param body JSON body text
 * \param key JSON key
 * \return String value, or empty string
 */
std::string HttpServer::getJsonString(const std::string& body, const std::string& key) const
{
    const std::string pattern = "\"" + key + "\"";
    const std::size_t keyPosition = body.find(pattern);

    if (keyPosition == std::string::npos)
    {
        return "";
    }

    const std::size_t colonPosition = body.find(':', keyPosition + pattern.size());
    const std::size_t firstQuotePosition = body.find('"', colonPosition + 1);
    const std::size_t secondQuotePosition = body.find('"', firstQuotePosition + 1);

    if (colonPosition == std::string::npos ||
        firstQuotePosition == std::string::npos ||
        secondQuotePosition == std::string::npos)
    {
        return "";
    }

    return body.substr(firstQuotePosition + 1, secondQuotePosition - firstQuotePosition - 1);
}

/**
 * \brief Read an integer value from a very small JSON body.
 * 
 * \param body JSON body text
 * \param key JSON key
 * \param fallback Fallback value when parsing fails
 * \return Parsed integer or fallback
 */
int HttpServer::getJsonInt(const std::string& body, const std::string& key, int fallback) const
{
    const std::string pattern = "\"" + key + "\"";
    const std::size_t keyPosition = body.find(pattern);

    if (keyPosition == std::string::npos)
    {
        return fallback;
    }

    const std::size_t colonPosition = body.find(':', keyPosition + pattern.size());

    if (colonPosition == std::string::npos)
    {
        return fallback;
    }

    std::size_t endPosition = body.find_first_of(",}", colonPosition + 1);

    if (endPosition == std::string::npos)
    {
        endPosition = body.size();
    }

    try
    {
        return std::stoi(body.substr(colonPosition + 1, endPosition - colonPosition - 1));
    }
    catch (...)
    {
        return fallback;
    }
}

/**
 * \brief Read a boolean value from a very small JSON body.
 * 
 * \param body JSON body text
 * \param key JSON key
 * \param fallback Fallback value when parsing fails
 * \return Parsed boolean or fallback
 */
bool HttpServer::getJsonBool(const std::string& body, const std::string& key, bool fallback) const
{
    const std::string pattern = "\"" + key + "\"";
    const std::size_t keyPosition = body.find(pattern);

    if (keyPosition == std::string::npos)
    {
        return fallback;
    }

    const std::size_t colonPosition = body.find(':', keyPosition + pattern.size());

    if (colonPosition == std::string::npos)
    {
        return fallback;
    }

    const std::size_t valuePosition = body.find_first_not_of(" \t\n\r", colonPosition + 1);

    if (valuePosition == std::string::npos)
    {
        return fallback;
    }

    if (body.compare(valuePosition, 4, "true") == 0)
    {
        return true;
    }

    if (body.compare(valuePosition, 5, "false") == 0)
    {
        return false;
    }

    return fallback;
}

/**
 * \brief Decode a URL encoded string.
 * 
 * \param text Encoded text
 * \return Decoded text
 */
std::string HttpServer::urlDecode(const std::string& text) const
{
    std::string result;
    result.reserve(text.size());

    for (std::size_t index = 0; index < text.size(); ++index)
    {
        if (text[index] == '%' && index + 2 < text.size())
        {
            const std::string hex = text.substr(index + 1, 2);
            const char decodedChar = static_cast<char>(std::stoi(hex, nullptr, 16));
            result.push_back(decodedChar);
            index += 2;
        }
        else if (text[index] == '+')
        {
            result.push_back(' ');
        }
        else
        {
            result.push_back(text[index]);
        }
    }

    return result;
}

/**
 * \brief Escape a text string for JSON output.
 * 
 * \param text Original text
 * \return Escaped JSON-safe text
 */
std::string HttpServer::escapeJson(const std::string& text) const
{
    std::string result;

    for (const char character : text)
    {
        switch (character)
        {
        case '"':
            result += "\\\"";
            break;
        case '\\':
            result += "\\\\";
            break;
        case '\n':
            result += "\\n";
            break;
        case '\r':
            result += "\\r";
            break;
        case '\t':
            result += "\\t";
            break;
        default:
            result.push_back(character);
            break;
        }
    }

    return result;
}
