# node-red-contrib-graphql-server

A set of nodes for <a href="http://nodered.org" target="_new">Node-RED</a> to run a local GraphQL Server.

## Install

To install the stable version use the Menu - Manage palette option and search for node-red-contrib-graphql-server ,
or Run the following command in your Node-RED user directory - typically `~/.node-red`

Note: Requries NodeJs version 11.15 or higher

    npm install node-red-contrib-graphql-server --engine-strict

## Usage

This node bundle helps you build a fully functional GraphQL Server for your application. It includes 3 nodes which together provide a full implementation
of GraphQL specifications:

- graphql-in : Creates a GraphQL server endpoint at the defined path supporting both query and mutation operations. The endpoint serves both <code>GET</code> and <code>POST</code> requests by default.</p>
- graphql-out: Sends responses back for requests recieved from a GraphQL In node.
- graphql-schema: Configuration to define a GraphQL schema.
- graphql-subscriptionserver : a graphql subscription server implementation using PubSub
