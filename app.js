document.addEventListener('DOMContentLoaded', () => {
    if (typeof solanaWeb3 === 'undefined') {
        console.error('solanaWeb3 is not defined. Check the CDN script in index.html.');
        alert('Failed to load Solana library. Please refresh the page.');
        return;
    }

    const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=f35cc901-41c6-4ff9-bb27-5a08edd86af8';
    const BIRDEYE_API_KEY = 'bd0d1187833841948e05b2e0fa08997d';
    const SOL_MINT = 'So11111111111111111111111111111111111111112';

    // Utility to add delay
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Enhanced wallet connection
    const connectWallet = async () => {
        if (!window.solana) {
            console.error('No Solana wallet detected. Ensure Phantom is installed.');
            alert('Please install the Phantom wallet extension.');
            return null;
        }

        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
            try {
                console.log(`Attempting wallet connection (attempt ${attempts + 1})`);
                await window.solana.connect();
                if (window.solana.isPhantom && window.solana.publicKey) {
                    console.log('Connected to Phantom:', window.solana.publicKey.toString());
                    return window.solana.publicKey.toString();
                }
                throw new Error('Phantom detected but no public key returned.');
            } catch (err) {
                console.error(`Connection attempt ${attempts + 1} failed:`, err);
                attempts++;
                if (attempts === maxAttempts) {
                    console.error('Max connection attempts reached.');
                    alert('Failed to connect to Phantom wallet. Please ensure it’s unlocked and try again.');
                    return null;
                }
                await delay(500);
            }
        }
    };

    document.getElementById('connectWallet').addEventListener('click', async () => {
        try {
            // Show loading message
            document.getElementById('tokenList').innerHTML = '<p>Loading token balances...</p>';

            // Connect wallet
            const publicKey = await connectWallet();
            if (!publicKey) {
                document.getElementById('tokenList').innerHTML = '<p>Wallet connection failed</p>';
                return;
            }

            // Connect to Solana Mainnet via Helius
            const connection = new solanaWeb3.Connection(HELIUS_RPC_URL, 'confirmed');

            // Fetch SOL balance
            const solBalance = await connection.getBalance(new solanaWeb3.PublicKey(publicKey));
            const solInSol = solBalance / solanaWeb3.LAMPORTS_PER_SOL;
            console.log('SOL balance:', solInSol); // Debug

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
                await delay(1000);
            }
            console.log('All prices:', prices); // Debug

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

            // Prepare token list for sorting
            const tokenList = [];

            // SOL
            const solValue = solInSol * prices[SOL_MINT];
            console.log('SOL USD value:', solValue); // Debug
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
            console.log('Token list before sort:', tokenList); // Debug

            // Sort by USD value, decreasing
            tokenList.sort((a, b) => b.usdValue - a.usdValue);

            // Build HTML with separators
            const tokenListHtml = tokenList
                .map(token => `<p>${token.line}</p><hr>`)
                .join('')
                .replace(/<hr>$/, '');

            // Update UI with forced refresh
            const tokenListElement = document.getElementById('tokenList');
            tokenListElement.innerHTML = tokenListHtml || '<p>No tokens found</p>';
            // Force repaint for Firefox
            tokenListElement.style.display = 'none';
            tokenListElement.offsetHeight; // Trigger reflow
            tokenListElement.style.display = 'block';
        } catch (error) {
            console.error('Connection error:', error);
            document.getElementById('tokenList').innerHTML = '<p>Error loading balances</p>';
            alert('Failed to connect wallet or fetch balances: ' + error.message);
        }
    });
});