document.addEventListener('DOMContentLoaded', () => {
    if (typeof solanaWeb3 === 'undefined') {
        console.error('solanaWeb3 is not defined. Check the CDN script in index.html.');
        alert('Failed to load Solana library. Please refresh the page.');
        return;
    }

    const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=f35cc901-41c6-4ff9-bb27-5a08edd86af8'; // Your Helius key
    const BIRDEYE_API_KEY = 'bd0d1187833841948e05b2e0fa08997d'; // Your Birdeye key
    const SOL_MINT = 'So11111111111111111111111111111111111111112';

    // Utility to add delay between requests
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    document.getElementById('connectWallet').addEventListener('click', async () => {
        if (window.solana && window.solana.isPhantom) {
            try {
                // Show loading message
                document.getElementById('tokenList').innerHTML = '<p>Loading token balances...</p>';

                // Connect to Phantom wallet
                await window.solana.connect();
                const publicKey = window.solana.publicKey.toString();
                console.log('Wallet connected:', publicKey);

                // Connect to Solana Mainnet via Helius
                const connection = new solanaWeb3.Connection(HELIUS_RPC_URL, 'confirmed');

                // Fetch SOL balance
                const solBalance = await connection.getBalance(new solanaWeb3.PublicKey(publicKey));
                const solInSol = solBalance / solanaWeb3.LAMPORTS_PER_SOL;

                // Fetch all SPL token accounts
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                    new solanaWeb3.PublicKey(publicKey),
                    { programId: new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
                );

                // Get unique SPL mints
                const splMints = [...new Set(tokenAccounts.value.map(account => account.account.data.parsed.info.mint))];

                // Mints to fetch prices for, including SOL
                const mintsToFetch = [SOL_MINT, ...splMints];

                // Fetch prices from Birdeye (single calls, sequential)
                const options = {
                    method: 'GET',
                    headers: {
                        'accept': 'application/json',
                        'x-chain': 'solana',
                        'X-API-KEY': BIRDEYE_API_KEY
                    }
                };
                const prices = {};
                for (const mint of mintsToFetch) {
                    try {
                        const response = await fetch(`https://public-api.birdeye.so/defi/price?address=${mint}`, options);
                        if (!response.ok) {
                            throw new Error(`Birdeye API error for ${mint}: ${response.status} - ${await response.text()}`);
                        }
                        const data = await response.json();
                        console.log(`Price data for ${mint}:`, data);
                        prices[mint] = data.data?.value || 0;
                    } catch (err) {
                        console.error(`Price fetch error for ${mint}:`, err);
                        prices[mint] = 0;
                    }
                    await delay(1000); // 1000ms delay
                }

                // Fetch metadata for SPL mints from Helius
                const metadataPromises = splMints.map(mint =>
                    fetch(HELIUS_RPC_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'getAsset',
                            params: { id: mint }
                        })
                    }).then(res => res.json())
                );
                const metadataResponses = await Promise.all(metadataPromises);

                // Prepare token list as array for sorting
                const tokenList = [];

                // SOL
                const solValue = solInSol * prices[SOL_MINT];
                tokenList.push({
                    usdValue: solValue,
                    line: `$ ${solValue.toFixed(2)} USD - SOL: ${solInSol}`
                });

                // SPL tokens
                for (const account of tokenAccounts.value) {
                    const tokenInfo = account.account.data.parsed.info;
                    const mint = tokenInfo.mint;
                    const amount = tokenInfo.tokenAmount.uiAmount;

                    if (amount > 0) {
                        // Get metadata
                        const metadata = metadataResponses.find(res => res.result?.id === mint);
                        const tokenName = metadata?.result?.content?.metadata?.name || 'Unknown';
                        const tokenSymbol = metadata?.result?.content?.metadata?.symbol || mint.slice(0, 6);

                        // Calculate USD value
                        const tokenPrice = prices[mint] || 0;
                        const usdValue = amount * tokenPrice;

                        // Add to token list
                        tokenList.push({
                            usdValue: usdValue,
                            line: `$ ${usdValue.toFixed(2)} USD - ${tokenName} (${tokenSymbol}): ${amount}`
                        });
                    }
                }

                // Sort by USD value, decreasing
                tokenList.sort((a, b) => b.usdValue - a.usdValue);

                // Build HTML with separators
                const tokenListHtml = tokenList
                    .map(token => `<p>${token.line}</p><hr>`)
                    .join('')
                    .replace(/<hr>$/, ''); // Remove trailing <hr>

                // Update UI
                document.getElementById('tokenList').innerHTML = tokenListHtml || '<p>No tokens found</p>';
            } catch (error) {
                console.error('Connection error:', error);
                document.getElementById('tokenList').innerHTML = '<p>Error loading balances</p>';
                alert('Failed to connect wallet or fetch balances: ' + error.message);
            }
        } else {
            alert('Please install the Phantom wallet extension.');
        }
    });
});