/*****************************************************************//**
 * \file   main.cpp
 * \brief  Program entry point for the browser-based Gomoku Arena project.
 * 
 * \author B11201116
 * \date   2026/4/1
 *********************************************************************/

#include "HttpServer.h"

#include <iostream>

/**
 * \brief Program entry point.
 * 
 * \param argc Argument count
 * \param argv Argument array
 * \return 0 if the program exits normally
 */
int main(int argc, char* argv[])
{
    int port = 8080;
    std::string webRoot = "../web";

    if (argc >= 2)
    {
        port = std::stoi(argv[1]);
    }

    if (argc >= 3)
    {
        webRoot = argv[2];
    }

    HttpServer server(port, webRoot);

    if (!server.start())
    {
        std::cerr << "Server start failed." << std::endl;
        return 1;
    }

    server.run();
    return 0;
}
