// Wait for the DOM to load to ensure solanaWeb3 is available
document.addEventListener('DOMContentLoaded', () => {
    // Check if solanaWeb3 is loaded
    if (typeof solanaWeb3 === 'undefined') {
        console.error('solanaWeb3 is not defined. Check the CDN script in index.html.');
        alert('Failed to load Solana library. Please refresh the page.');
        return;
    }

    document.getElementById('connectWallet').addEventListener('click', async () => {
        if (window.solana && window.solana.isPhantom) {
            try {
                // Connect to Phantom wallet
                await window.solana.connect();
                const publicKey = window.solana.publicKey.toString();
                console.log('Wallet connected:', publicKey);

                // Connect to Solana Devnet
                const connection = new solanaWeb3.Connection('https://api.devnet.solana.com', 'confirmed');

                // Get balance
                const balance = await connection.getBalance(new solanaWeb3.PublicKey(publicKey));
                document.getElementById('balance').innerText = `Balance: ${balance / solanaWeb3.LAMPORTS_PER_SOL} SOL`;
            } catch (error) {
                console.error('Connection error:', error);
                alert('Failed to connect wallet.');
            }
        } else {
            alert('Please install the Phantom wallet extension.');
        }
    });
});