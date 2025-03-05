import React from 'react';
import ReactDOM from 'react-dom';

const { useState, useEffect, useMemo } = React;

// Main App Component
function App() {
    const [room] = useState(() => new WebsimSocket());
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');
    const [prompt, setPrompt] = useState('');
    const [generatedText, setGeneratedText] = useState('');
    const [showGeneratedText, setShowGeneratedText] = useState(false);

    // Get cats from collection and sync with React
    const cats = React.useSyncExternalStore(
        room.collection('cat').subscribe,
        () => room.collection('cat').getList()
    );

    // Sort cats by creation date (newest first)
    const sortedCats = useMemo(() => {
        return [...cats].sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );
    }, [cats]);

    // Get peers
    const peers = React.useSyncExternalStore(
        room.party.subscribe,
        () => room.party.peers
    );

    // Generate cat description using LLM
    const generateCatDescription = async (userPrompt) => {
        try {
            setError('');
            setIsGenerating(true);
            setShowGeneratedText(false);
            
            const completion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a creative writer specializing in fantastical and unique cat descriptions. 
                        Create a detailed, imaginative, and somewhat surreal description of a cat that does not exist.
                        Include physical characteristics, personality traits, and a brief backstory.
                        Make it detailed enough to be used as an image generation prompt.
                        Your description should be 3-5 sentences long.`
                    },
                    {
                        role: "user",
                        content: `Create a detailed description of an imaginary cat based on this prompt: "${userPrompt}".
                        If the prompt is empty or vague, create something completely original.`
                    }
                ]
            });

            const catDescription = completion.content;
            setGeneratedText(catDescription);
            setShowGeneratedText(true);
            return catDescription;
        } catch (err) {
            console.error("Error generating cat description:", err);
            setError("Failed to generate cat description. Please try again.");
            return null;
        }
    };

    // Generate cat image using the generated description
    const generateCatImage = async (description) => {
        try {
            const result = await websim.imageGen({
                prompt: `Photorealistic cat: ${description}. Detailed fur texture, expressive eyes, dramatic lighting, studio quality, 8k, ultra detailed`,
                aspect_ratio: "1:1"
            });
            return result.url;
        } catch (err) {
            console.error("Error generating cat image:", err);
            setError("Failed to generate cat image. Please try again.");
            return null;
        }
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!prompt.trim() && !generatedText) {
            setError("Please enter a prompt for your imaginary cat");
            return;
        }
        
        try {
            setIsGenerating(true);
            
            // Step 1: Generate cat description if not already generated
            let description = generatedText;
            if (!description) {
                description = await generateCatDescription(prompt);
                if (!description) {
                    setIsGenerating(false);
                    return;
                }
            }
            
            // Step 2: Generate cat image based on description
            const imageUrl = await generateCatImage(description);
            if (!imageUrl) {
                setIsGenerating(false);
                return;
            }
            
            // Step 3: Save to database
            await room.collection('cat').create({
                prompt: prompt,
                description: description,
                image_url: imageUrl
            });
            
            // Reset form
            setPrompt('');
            setGeneratedText('');
            setShowGeneratedText(false);
            setIsGenerating(false);
        } catch (err) {
            console.error("Error in cat generation process:", err);
            setError("Something went wrong. Please try again.");
            setIsGenerating(false);
        }
    };

    // Handle regenerating description
    const handleRegenerateDescription = async () => {
        if (isGenerating) return;
        await generateCatDescription(prompt);
    };

    // Get creator username for display
    const [creatorUsername, setCreatorUsername] = useState('');
    useEffect(() => {
        async function fetchCreator() {
            const creator = await window.websim.getCreatedBy();
            setCreatorUsername(creator.username);
        }
        fetchCreator();
    }, []);
    
    // Count online users
    const onlineCount = Object.keys(peers).length;

    return (
        <div className="container">
            <header className="header">
                <h1>This Cat Does Not Exist</h1>
                <p>Generate fantastical felines that never were</p>
                <div className="online-indicator">
                    {onlineCount} user{onlineCount !== 1 ? 's' : ''} online
                </div>
            </header>
            
            <div className="generator-form">
                {error && <div className="error-message">{error}</div>}
                
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="prompt">Describe your imaginary cat:</label>
                        <input 
                            type="text" 
                            id="prompt"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g., Cyberpunk cat with neon fur, three-eyed galactic pet..."
                            disabled={isGenerating}
                        />
                    </div>
                    
                    {showGeneratedText && (
                        <div className="form-group">
                            <label>Generated Description:</label>
                            <div className="generated-text">
                                <p>{generatedText}</p>
                                <button 
                                    type="button" 
                                    onClick={handleRegenerateDescription}
                                    disabled={isGenerating}
                                    className="secondary-button"
                                >
                                    Regenerate Description
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {isGenerating ? (
                        <div className="loading-indicator">
                            <div className="loading-spinner"></div>
                            <span>Creating your imaginary cat...</span>
                        </div>
                    ) : (
                        <button type="submit" disabled={isGenerating}>
                            {showGeneratedText ? 'Generate Image & Save' : 'Generate Description'}
                        </button>
                    )}
                </form>
            </div>
            
            <div className="gallery-container">
                <h2>Cat Gallery</h2>
                
                {sortedCats.length === 0 ? (
                    <div className="empty-state">
                        <p>No cats generated yet. Be the first to create an imaginary cat!</p>
                    </div>
                ) : (
                    <div className="gallery">
                        {sortedCats.map(cat => (
                            <div key={cat.id} className="gallery-item">
                                <img src={cat.image_url} alt="Generated Cat" />
                                <div className="gallery-content">
                                    <h3>{cat.prompt || "Mysterious Cat"}</h3>
                                    <p>{cat.description}</p>
                                    <div className="creator-info">
                                        <img src={`https://images.websim.ai/avatar/${cat.username}`} alt={cat.username} />
                                        <span>Created by {cat.username === creatorUsername ? 'you' : cat.username}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

ReactDOM.render(<App />, document.getElementById('root'));

