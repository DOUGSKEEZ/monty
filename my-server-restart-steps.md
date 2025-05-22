
My process for starting the backend server:
```
cd /home/monty/monty/backend
npm run dev
```

My process for making sure everything is off for restarting the backend server:
 ```
pkill -f "node.*server.js" || true
sleep 5
cd /home/monty/monty/backend
npm run dev
```
