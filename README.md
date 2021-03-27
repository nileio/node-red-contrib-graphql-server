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

## Known Issues

- On restart of Node-RED , a console error message appears "cannot read property address of null". I am unable to re-produce this issue so investigation continues. I currently use RED.server.address().address but this should always return a value. Investigation continues, please add a comment for the issue in github if you have any thoughts to resolve this issue. Currently a Re-deploy of the flow is required every time you restart Node-RED in order to run GraphQL in node.

- Pagination Specs support is an expermintal feature and it is incomplete. It attempts to automatically provide the boilerplate code required for Pagination.