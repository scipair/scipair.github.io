# SciPair

A powerful tool for exploring academic relationships between authors using data from OpenAlex. Compare authors, visualize citations, collaborations, and analyze publication trends over time.

🌐 **Live Demo**: [https://scipair.github.io](https://scipair.github.io)

**Created by:**
- [Danishjeet Singh](https://singhdan.me)
- [Filipi N. Silva](https://filipinascimento.github.io)

## ✨ Features

### 📊 Author Comparison
- **Smart Search**: Autocomplete functionality for finding authors
- **Side-by-Side Comparison**: Compare two authors with their complete publication records
- **Citation Analysis**: Visualize citing relationships between authors' works
- **Coauthorship Detection**: Highlight collaborative papers

### 🎯 Interactive Filtering
- **Dynamic Filter Buttons**: Click to focus on specific relationship types
- **Citing A/B**: Papers where one author cites the other
- **Cited by A/B**: Papers where one author is cited by the other  
- **Coauthored**: Papers written together
- **All Papers**: Complete publication list

### 📈 Temporal Analytics
- **Publication Trends**: Line charts showing publication counts over time
- **Collaboration Timeline**: Bar charts displaying citations and collaborations by year
- **Color-blind Friendly**: Accessible pastel color scheme

### 🕸️ Network Visualization
- **Collaboration Networks**: Interactive visualization of author relationships
- **Shared Collaborators**: Identify mutual connections between authors
- **Dynamic Sizing**: Node and edge sizes reflect collaboration strength
- **Interactive**: Drag, zoom, and hover for detailed exploration

## 🎨 Visual Indicators

- **🔵 Blue (↑)**: Papers where Author A cites Author B
- **🟠 Orange (↓)**: Papers where Author A is cited by Author B  
- **🟣 Purple (○)**: Papers coauthored by both authors
- **🟪 Purple Nodes**: Shared collaborators in network view

## 🚀 Technology Stack

- **React** - Modern frontend framework
- **Chart.js** - Interactive data visualizations
- **vis-network** - Network graph visualization
- **Axios** - HTTP client for API requests
- **Bulma CSS** - Responsive CSS framework
- **OpenAlex API** - Comprehensive academic database

## 💻 Development

### Prerequisites
- Node.js (v14 or later)
- npm or yarn

### Local Setup
```bash
# Clone the repository
git clone https://github.com/scipair/scipair.github.io.git
cd scipair.github.io

# Install dependencies
npm install

# Start development server
npm start
```

The app will open at `http://localhost:3000`.

### Production Build
```bash
npm run build
```

## 📖 Usage Guide

1. **Search Authors**: Type author names in the search fields
2. **Select from Autocomplete**: Choose authors from the dropdown suggestions
3. **Explore Relationships**: Wait for data to load and view highlighted connections
4. **Use Filter Buttons**: Click buttons to focus on specific relationship types
5. **Analyze Trends**: Switch to Analytics tab for temporal insights
6. **Explore Networks**: View Network tab for collaboration visualization
7. **Access Papers**: Click any paper title to view the full publication

## 🔌 API

Powered by the [OpenAlex API](https://openalex.org/) - a free, comprehensive database of scholarly works. No API key required.

## 🤝 Contributing

We welcome contributions! Feel free to:
- Report bugs or request features via [GitHub Issues](https://github.com/scipair/scipair.github.io/issues)
- Submit pull requests for improvements
- Share feedback and suggestions

## 📄 License

This project is open source. 
