const ethers = require('ethers')
const axios = require('axios')

const rpc = process.env.RPC_URL
const provider = new ethers.providers.JsonRpcProvider(rpc)

// For csv export
const fs = require('fs')
const { format } = require('@fast-csv/format')
const fileName = 'export.csv'
const csvFile = fs.createWriteStream(fileName)
const stream = format({ headers:true })
stream.pipe(csvFile)
const headers = [
    'block_number', 'block_hash', 'block_timestamp', 'header_fee_recipient', 'validator_fee_recipient', 
    'header_fee_recipient_balance_change_in_eth', 'validator_fee_recipient_balance_change_in_eth', 'gas_used', 'gas_limit',
    'base_fee_per_gas_in_eth', 'extra_data', 'block_origin', 'is_fb_builder', 'builder', 'proposer_total_reward_in_eth'
]
console.log(headers.length)
stream.write(headers)


const fbDataApiUrl = 'https://boost-relay.flashbots.net/relay/v1/data'

// Our mergers on mainnet
const fbBuilders = [
    "0x81beef03aafd3dd33ffd7deb337407142c80fea2690e5b3190cfc01bde5753f28982a7857c96172a75a234cb7bcb994f",
    "0xa1dead01e65f0a0eee7b5170223f20c8f0cbf122eac3324d61afbdb33a8885ff8cab2ef514ac2c7698ae0d6289ef27fc",
    "0x81babeec8c9f2bb9c329fd8a3b176032fe0ab5f3b92a3f44d4575a231c7bd9c31d10b6328ef68ed1e8c02a3dbc8e80f9",
    "0xa1defa73d675983a6972e8686360022c1ebc73395067dd1908f7ac76a526a19ac75e4f03ccab6788c54fdb81ff84fc1b"
]


// To fetch how much ETH the address made before/after the block
const getRegularBlockCoinbaseDiff = async(address, blockNo, block) => {
    const minerBalanceBefore = await provider.getBalance(address, blockNo - 1)
    const minerBalanceAfter = await provider.getBalance(address, blockNo)
    const minerProfit = minerBalanceAfter.sub(minerBalanceBefore)
    const minerProfitETH = (ethers.utils.formatEther(minerProfit))
    const netCoinbaseDiff = (parseFloat(minerProfitETH))
    // we remove txs originating from fee fee_recipient within the block to account for payouts to avoid negatives
    const blockTransactions = block.transactions
    let counter = ethers.BigNumber.from(0)
    // from fee fee_recipient's EOA
    const coinbaseTxs = blockTransactions.filter((tx) => tx.from.toLowerCase() === address.toLowerCase())
    coinbaseTxs.map((tx)=> {
        counter = counter.add(tx.value)
    })
    const final = parseFloat(ethers.utils.formatEther(counter.toString())) + netCoinbaseDiff
    return final
}

const startBlock = parseInt(process.env.START_BLOCK)
const endBlock = parseInt(process.env.END_BLOCK)

const main = async () => {
    for(var blockNo=startBlock;blockNo<=endBlock;blockNo++){
        try{
            console.log(`At block #${blockNo}`)
            const block = await provider.getBlockWithTransactions(blockNo)
            const gasLimit = parseInt(block.gasLimit)
            const gasUsed = parseInt(block.gasUsed)
            const baseFeePerGas = ethers.utils.formatEther(block.baseFeePerGas) // in eth
            const blockHash = block.hash
            const headerFeeRecipient = block.miner.toLowerCase() // fee receipent (could be builder or validator's address)
            const headerFeeRecipientBalanceChange = await getRegularBlockCoinbaseDiff(block.miner, block.number, block)            
            const netGasPriceWithoutBaseFee = headerFeeRecipientBalanceChange/gasUsed
            const timestamp = block.timestamp
            const extraData = block.extraData
            console.log('------------------------------------------------------------')
            
            // Check if any payloads were delivered by our relay at this blockHeight
            const payloads = (await axios.get(`${fbDataApiUrl}/bidtraces/proposer_payload_delivered?block_number=${blockNo}`)).data

            // Declare local variables
            var validatorFeeRecipient, validatorFeeRecipientBalanceChange, blockOrigin, builder, isFbBuilder, proposerTotalRewardInEth

            if(payloads.length>0){
                console.log("FB relay block")
                // Double check to get the exact delivered payload incase there's multiple payloads for diff slots (edge case)
                var entry = (payloads.filter(payload => {
                    return payload.block_hash.toLowerCase() == blockHash.toLowerCase()
                }))[0]
                validatorFeeRecipient = entry.proposer_fee_recipient.toLowerCase()
                validatorFeeRecipientBalanceChange = await getRegularBlockCoinbaseDiff(validatorFeeRecipient, blockNo, block)
                blockOrigin = 'fb-relay'
                builder = entry.builder_pubkey.toLowerCase()
                isFbBuilder = fbBuilders.includes(builder)
                proposerTotalRewardInEth = parseFloat(ethers.utils.formatEther(entry.value))
            }else{
                console.log("Non FB relay block")
                validatorFeeRecipient = headerFeeRecipient
                validatorFeeRecipientBalanceChange = headerFeeRecipientBalanceChange
                blockOrigin = 'other'
                builder = 'none'
                isFbBuilder = false
                proposerTotalRewardInEth = headerFeeRecipientBalanceChange

            }

            const finalRow = [
                blockNo, blockHash, timestamp, headerFeeRecipient, validatorFeeRecipient, headerFeeRecipientBalanceChange,
                validatorFeeRecipientBalanceChange, gasUsed, gasLimit, baseFeePerGas, extraData, blockOrigin,
                isFbBuilder, builder, proposerTotalRewardInEth
            ]
            stream.write(finalRow)
        }catch(error){
            console.log(error)

        }
    }
    stream.end()

}

main()
