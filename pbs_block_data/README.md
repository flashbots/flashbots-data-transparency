# Flashbots block analysis

Script that exports relevant builder/proposer metrics

## Instructions


1) Install packages with 

    `cd pbs_block_data && npm install`

2) Run the script for desired block range

    `RPC_URL=https://mainnet.infura.io/v3/..... START_BLOCK=15746800 END_BLOCK=15746810 node src/index.js`

3) Verify the csv

    `head export.csv`