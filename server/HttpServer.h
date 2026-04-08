/*****************************************************************//**
 * \file   HttpServer.h
 * \brief  HTTP server declarations for the browser-based Gomoku Arena project.
 * 
 * \author B11201116
 * \date   2026/4/1
 *********************************************************************/

#ifndef HTTPSERVER_H
#define HTTPSERVER_H

#include "RoomManager.h"

#include <string>

/**
 * \brief Minimal HTTP server for serving static files and game APIs.
 */
class HttpServer
{
public:
    /**
     * \brief Construct a server on the given port and web root.
     * 
     * \param port Listening port
     * \param webRoot Static web root directory
     */
    HttpServer(int port, const std::string& webRoot);

    /**
     * \brief Destroy the server and release socket resources.
     */
    ~HttpServer();

    /**
     * \brief Start listening on the configured port.
     * 
     * \return True if startup succeeds
     */
    bool start();

    /**
     * \brief Enter the blocking request loop.
     */
    void run();

private:
    std::string handleRequest(const std::string& rawRequest);
    std::string handleStaticFile(const std::string& path);
    std::string handleCreateRoom(const std::string& body);
    std::string handleJoinRoom(const std::string& body);
    std::string handleStatus(const std::string& path);
    std::string handleMove(const std::string& body);
    std::string handleRestartRequest(const std::string& body);
    std::string handleRestartRespond(const std::string& body);
    std::string handleUndoRequest(const std::string& body);
    std::string handleUndoRespond(const std::string& body);
    std::string handleLeaveRoom(const std::string& body);

    std::string makeHttpResponse(const std::string& status,
                                 const std::string& contentType,
                                 const std::string& body) const;
    std::string jsonMessage(const std::string& message, bool ok = false) const;
    std::string roomSnapshotToJson(const RoomSnapshot& snapshot, const std::string& viewerToken) const;
    std::string getQueryValue(const std::string& path, const std::string& key) const;
    std::string getJsonString(const std::string& body, const std::string& key) const;
    int getJsonInt(const std::string& body, const std::string& key, int fallback) const;
    bool getJsonBool(const std::string& body, const std::string& key, bool fallback) const;
    std::string urlDecode(const std::string& text) const;
    std::string escapeJson(const std::string& text) const;

private:
    int m_port = 8080;
    std::string m_webRoot;
    int m_serverSocket = -1;
    RoomManager m_roomManager;
};

#endif
