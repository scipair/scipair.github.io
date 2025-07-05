import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [author1, setAuthor1] = useState('');
  const [author2, setAuthor2] = useState('');
  const [author1Data, setAuthor1Data] = useState(null);
  const [author2Data, setAuthor2Data] = useState(null);
  const [author1Autocomplete, setAuthor1Autocomplete] = useState([]);
  const [author2Autocomplete, setAuthor2Autocomplete] = useState([]);
  const [author1Works, setAuthor1Works] = useState(new Map());
  const [author2Works, setAuthor2Works] = useState(new Map());
  const [author1Stats, setAuthor1Stats] = useState({ citing: 0, cited: 0, coauthored: 0, total: 0 });
  const [author2Stats, setAuthor2Stats] = useState({ citing: 0, cited: 0, coauthored: 0, total: 0 });
  const [activeFilter, setActiveFilter] = useState({ author1: 'all', author2: 'all' });
  const [loading, setLoading] = useState(false);
  const [inputsDisabled, setInputsDisabled] = useState(false);
  const [userTyping, setUserTyping] = useState({ author1: false, author2: false });
  const [autocompletePosition, setAutocompletePosition] = useState({ author1: {}, author2: {} });
  const [isHighlighting, setIsHighlighting] = useState(false);
  
  const debounceTimer = useRef(null);
  const author1InputRef = useRef(null);
  const author2InputRef = useRef(null);

  // Default authors
  const defaultAuthor1 = 'Filippo Menczer';
  const defaultAuthor2 = 'Santo Fortunato';

  // Function definitions first
  const updateHash = useCallback(() => {
    const author1Id = author1Data?.short_id.split('/')[1] || '';
    const author2Id = author2Data?.short_id.split('/')[1] || '';
    window.location.hash = `${author1Id};${author2Id}`;
  }, [author1Data, author2Data]);

  const fetchAuthorWorks = useCallback(async (authorId, inputId) => {
    let cursor = '*';
    let hasMore = true;
    const worksMap = new Map();

    try {
      // Set loading state if not already set
      if (!loading) {
        setLoading(true);
        setInputsDisabled(true);
      }
      
      while (hasMore) {
        const response = await axios.get(`https://api.openalex.org/works?per_page=200&filter=authorships.author.id:${authorId}&cursor=${cursor}`);
        const works = response.data.results;
        cursor = response.data.meta.next_cursor;
        hasMore = !!cursor;

        works.sort((a, b) => b.publication_year - a.publication_year);

        works.forEach(work => {
          const workData = {
            id: work.id,
            title: work.title,
            publication_year: work.publication_year,
            referenced_works: new Set(work.referenced_works || []),
            venue: work.primary_location?.source?.display_name || 'Unknown Venue',
            url: work.primary_location?.landing_page_url || null,
            citing: false,
            cited: false,
            coauthored: false
          };
          worksMap.set(work.id, workData);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (inputId === 'author1') {
        setAuthor1Works(worksMap);
      } else {
        setAuthor2Works(worksMap);
      }

    } catch (error) {
      console.error('Error fetching works:', error);
      // Clear loading states on error
      setLoading(false);
      setInputsDisabled(false);
    }
    // Don't clear loading here - let highlighting complete first
  }, [loading]);

  const selectDefaultAuthor = useCallback(async (inputId, authorNameOrId) => {
    try {
      const query = authorNameOrId || (inputId === 'author1' ? defaultAuthor1 : defaultAuthor2);
      
      // Set loading state immediately when selecting default author
      setLoading(true);
      setInputsDisabled(true);
      
      let author = null;
      
      // If it looks like an OpenAlex ID (starts with 'A'), search by ID
      if (query.startsWith('A') && query.length > 10) {
        try {
          const response = await axios.get(`https://api.openalex.org/authors/${query}`);
          if (response.data) {
            author = {
              display_name: response.data.display_name,
              hint: response.data.last_known_institutions?.[0]?.display_name || 'Unknown Institution',
              short_id: response.data.id
            };
          }
        } catch (error) {
          console.log('ID search failed, trying name search');
        }
      }
      
      // If ID search failed or it's a name, use autocomplete
      if (!author) {
        const response = await axios.get(`https://api.openalex.org/autocomplete/authors?q=${query}`);
        const authors = response.data.results;
        if (authors.length > 0) {
          author = authors[0];
        }
      }
      
      if (author) {
        if (inputId === 'author1') {
          // Only set if user is not currently typing
          if (!userTyping.author1) {
            setAuthor1(author.display_name);
          }
          setAuthor1Data(author);
          // Clear existing works to prevent glitching
          setAuthor1Works(new Map());
          setAuthor1Stats({ citing: 0, cited: 0, coauthored: 0, total: 0 });
        } else {
          // Only set if user is not currently typing
          if (!userTyping.author2) {
            setAuthor2(author.display_name);
          }
          setAuthor2Data(author);
          // Clear existing works to prevent glitching
          setAuthor2Works(new Map());
          setAuthor2Stats({ citing: 0, cited: 0, coauthored: 0, total: 0 });
        }
        await fetchAuthorWorks(author.short_id.split('/')[1], inputId);
        updateHash();
      }
    } catch (error) {
      console.error('Error selecting default author:', error);
      // Clear loading states on error
      setLoading(false);
      setInputsDisabled(false);
    }
  }, [fetchAuthorWorks, updateHash, defaultAuthor1, defaultAuthor2, userTyping]);

  const highlightCitations = useCallback(() => {
    if (author1Works.size === 0 || author2Works.size === 0 || isHighlighting) return;

    setIsHighlighting(true);

    // Use setTimeout to prevent blocking the UI during heavy computation
    setTimeout(() => {
      let author1CitingCount = 0;
      let author1CitedCount = 0;
      let author1CoauthoredCount = 0;
      let author2CitingCount = 0;
      let author2CitedCount = 0;
      let author2CoauthoredCount = 0;

      const newAuthor1Works = new Map();
      const newAuthor2Works = new Map();

      // Create new objects for each work to ensure proper React re-rendering
      author1Works.forEach((work, id) => {
        newAuthor1Works.set(id, {
          ...work,
          citing: false,
          cited: false,
          coauthored: false
        });
      });

      author2Works.forEach((work, id) => {
        newAuthor2Works.set(id, {
          ...work,
          citing: false,
          cited: false,
          coauthored: false
        });
      });

      // Apply highlights
      newAuthor1Works.forEach((work1, id1) => {
        newAuthor2Works.forEach((work2, id2) => {
          if (work1.referenced_works.has(id2)) {
            author1CitingCount++;
            author2CitedCount++;
            work1.citing = true;
            work2.cited = true;
          }
          if (work2.referenced_works.has(id1)) {
            author1CitedCount++;
            author2CitingCount++;
            work1.cited = true;
            work2.citing = true;
          }
          if (id1 === id2) {
            author1CoauthoredCount++;
            author2CoauthoredCount++;
            work1.coauthored = true;
            work2.coauthored = true;
          }
        });
      });

      setAuthor1Works(newAuthor1Works);
      setAuthor2Works(newAuthor2Works);
      setAuthor1Stats({
        citing: author1CitingCount,
        cited: author1CitedCount,
        coauthored: author1CoauthoredCount,
        total: newAuthor1Works.size
      });
      setAuthor2Stats({
        citing: author2CitingCount,
        cited: author2CitedCount,
        coauthored: author2CoauthoredCount,
        total: newAuthor2Works.size
      });

      // Clear all loading states when highlighting is complete
      setIsHighlighting(false);
      setLoading(false);
      setInputsDisabled(false);
    }, 100);
  }, [author1Works, author2Works, isHighlighting]);

  // useEffect hooks after function definitions
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (hash) {
      const [author1Id, author2Id] = hash.split(';');
      // Don't set the input values to IDs, let selectDefaultAuthor handle it
      selectDefaultAuthor('author1', author1Id);
      selectDefaultAuthor('author2', author2Id);
    } else {
      setAuthor1(defaultAuthor1);
      setAuthor2(defaultAuthor2);
      selectDefaultAuthor('author1');
      selectDefaultAuthor('author2');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Remove dependencies to prevent re-running when user is typing

  // Trigger highlighting when both authors have works loaded
  useEffect(() => {
    if (author1Works.size > 0 && author2Works.size > 0 && !isHighlighting) {
      // Use setTimeout to ensure all state updates are complete
      setTimeout(() => {
        highlightCitations();
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [author1Works.size, author2Works.size]); // Use sizes to avoid unnecessary re-runs



  // Cleanup effect to ensure inputs are not stuck disabled
  useEffect(() => {
    return () => {
      setInputsDisabled(false);
    };
  }, []);

  // Update autocomplete positions on scroll/resize
  useEffect(() => {
    const handleScrollResize = () => {
      if (author1Autocomplete.length > 0) {
        updateAutocompletePosition('author1');
      }
      if (author2Autocomplete.length > 0) {
        updateAutocompletePosition('author2');
      }
    };

    window.addEventListener('scroll', handleScrollResize);
    window.addEventListener('resize', handleScrollResize);
    
    return () => {
      window.removeEventListener('scroll', handleScrollResize);
      window.removeEventListener('resize', handleScrollResize);
    };
  }, [author1Autocomplete.length, author2Autocomplete.length]);

  const handleInputChange = (inputId, value) => {
    // Mark user as typing
    setUserTyping(prev => ({ ...prev, [inputId]: true }));
    
    // Immediately update the input value to prevent glitching
    if (inputId === 'author1') {
      setAuthor1(value);
      
      // Clear data immediately when user starts typing something different
      if (author1Data && value !== author1Data.display_name) {
        clearAuthorData('author1');
      }
      // If input is cleared completely, also clear data
      if (value.trim() === '' && author1Data) {
        clearAuthorData('author1');
      }
    } else {
      setAuthor2(value);
      
      // Clear data immediately when user starts typing something different
      if (author2Data && value !== author2Data.display_name) {
        clearAuthorData('author2');
      }
      // If input is cleared completely, also clear data
      if (value.trim() === '' && author2Data) {
        clearAuthorData('author2');
      }
    }
    
    // Only fetch if the user has typed enough characters
    if (value && value.length >= 2) {
      throttledFetchAuthors(inputId, value);
    } else {
      // Clear autocomplete if not enough characters
      if (inputId === 'author1') {
        setAuthor1Autocomplete([]);
      } else {
        setAuthor2Autocomplete([]);
      }
    }
    
    // Clear typing state after a delay
    setTimeout(() => {
      setUserTyping(prev => ({ ...prev, [inputId]: false }));
    }, 1000);
  };

  const updateAutocompletePosition = (inputId) => {
    const inputRef = inputId === 'author1' ? author1InputRef.current : author2InputRef.current;
    if (inputRef) {
      const rect = inputRef.getBoundingClientRect();
      setAutocompletePosition(prev => ({
        ...prev,
        [inputId]: {
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width
        }
      }));
    }
  };

  const handleInputFocus = (inputId) => {
    setUserTyping(prev => ({ ...prev, [inputId]: true }));
    updateAutocompletePosition(inputId);
  };

  const handleInputBlur = (inputId) => {
    // Clear typing state after a short delay to allow for autocomplete selection
    setTimeout(() => {
      setUserTyping(prev => ({ ...prev, [inputId]: false }));
    }, 200);
  };

  const throttledFetchAuthors = (inputId, query) => {
    clearTimeout(debounceTimer.current);
    
    // Only proceed if we have a meaningful query
    if (query && query.length >= 2) {
      debounceTimer.current = setTimeout(() => fetchAuthors(inputId, query), 500);
    }
  };

  const fetchAuthors = async (inputId, query) => {
    if (query.length < 2) {
      if (inputId === 'author1') {
        setAuthor1Autocomplete([]);
      } else {
        setAuthor2Autocomplete([]);
      }
      return;
    }

    try {
      const response = await axios.get(`https://api.openalex.org/autocomplete/authors?q=${query}`);
      const authors = response.data.results;
      if (inputId === 'author1') {
        setAuthor1Autocomplete(authors);
      } else {
        setAuthor2Autocomplete(authors);
      }
      // Update position when showing autocomplete
      updateAutocompletePosition(inputId);
    } catch (error) {
      console.error('Error fetching authors:', error);
    }
  };

  const selectAuthor = (author, inputId) => {
    // Clear autocomplete first to prevent interference
    setAuthor1Autocomplete([]);
    setAuthor2Autocomplete([]);
    
    // Trigger loading state immediately when selecting an author
    setLoading(true);
    setInputsDisabled(true);
    
    if (inputId === 'author1') {
      setAuthor1(author.display_name);
      setAuthor1Data(author);
      // Clear any existing works to prevent glitching during comparison
      setAuthor1Works(new Map());
      setAuthor1Stats({ citing: 0, cited: 0, coauthored: 0, total: 0 });
    } else {
      setAuthor2(author.display_name);
      setAuthor2Data(author);
      // Clear any existing works to prevent glitching during comparison
      setAuthor2Works(new Map());
      setAuthor2Stats({ citing: 0, cited: 0, coauthored: 0, total: 0 });
    }
    
    fetchAuthorWorks(author.short_id.split('/')[1], inputId);
    updateHash();
  };

  const clearAuthorData = (inputId) => {
    if (inputId === 'author1') {
      setAuthor1Data(null);
      setAuthor1Works(new Map());
      setAuthor1Stats({ citing: 0, cited: 0, coauthored: 0, total: 0 });
      setAuthor1Autocomplete([]);
    } else {
      setAuthor2Data(null);
      setAuthor2Works(new Map());
      setAuthor2Stats({ citing: 0, cited: 0, coauthored: 0, total: 0 });
      setAuthor2Autocomplete([]);
    }
    
    // Reset filter to 'all' when clearing data
    setActiveFilter(prev => ({
      ...prev,
      [inputId]: 'all'
    }));
    
    // Clear highlighting state to prevent glitching
    setIsHighlighting(false);
  };

  const setFilter = (inputId, filterType) => {
    setActiveFilter(prev => ({
      ...prev,
      [inputId]: filterType
    }));
  };

  const getWorkClasses = (work) => {
    const classes = ['author-works'];
    if (work.citing) classes.push('highlight-citing');
    if (work.cited) classes.push('highlight-cited');
    if (work.coauthored) classes.push('highlight-coauthored');
    return classes.join(' ');
  };

  const shouldShowWork = (work, inputId) => {
    const filter = activeFilter[inputId];
    
    // If filter is 'all', show all papers
    if (filter === 'all') {
      return true;
    }
    
    // If filter is 'highlighted', show only papers with relationships
    if (filter === 'highlighted') {
      return work.citing || work.cited || work.coauthored;
    }
    
    // Show papers based on specific relationship filter
    if (filter === 'citing') return work.citing;
    if (filter === 'cited') return work.cited;
    if (filter === 'coauthored') return work.coauthored;
    
    return true;
  };

  const renderAuthorWorks = (works, inputId) => {
    return Array.from(works.values())
      .filter(work => shouldShowWork(work, inputId))
      .map(work => (
        <div
          key={work.id}
          className={getWorkClasses(work)}
          onClick={() => work.url && window.open(work.url, '_blank')}
          style={{ cursor: work.url ? 'pointer' : 'default' }}
        >
          {work.title} ({work.publication_year}) - {work.venue}
        </div>
      ));
  };

  const renderFilterButtons = (stats, inputId) => {
    const otherAuthor = inputId === 'author1' ? 'B' : 'A';
    const currentFilter = activeFilter[inputId];
    
    return (
      <div className="filter-buttons">
        <button
          className={`filter-button filter-citing ${currentFilter === 'citing' ? 'active' : ''}`}
          onClick={() => setFilter(inputId, 'citing')}
        >
          ↑ Citing {otherAuthor}: {stats.citing}
        </button>
        <button
          className={`filter-button filter-cited ${currentFilter === 'cited' ? 'active' : ''}`}
          onClick={() => setFilter(inputId, 'cited')}
        >
          ↓ Cited by {otherAuthor}: {stats.cited}
        </button>
        <button
          className={`filter-button filter-coauthored ${currentFilter === 'coauthored' ? 'active' : ''}`}
          onClick={() => setFilter(inputId, 'coauthored')}
        >
          ○ Coauthored: {stats.coauthored}
        </button>
        <button
          className={`filter-button filter-all ${currentFilter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter(inputId, 'all')}
        >
          All Papers: {stats.total}
        </button>
      </div>
    );
  };

  return (
    <div className="App">
      <div className="title">SciPair</div>
      <div className="description">
        A tool to explore relationships between authors using data from OpenAlex. Compare authors, visualize coauthorships and citations. Created by&nbsp;
        <a href="https://singhdan.me" target="_blank" rel="noopener noreferrer">Danishjeet Singh</a> and <a href="https://filipinascimento.github.io" target="_blank" rel="noopener noreferrer">Filipi N. Silva</a>.
        <br />
        <a href="https://github.com/scipair/scipair" target="_blank" rel="noopener noreferrer">GitHub Repository</a>
      </div>
      
      <div className="columns is-multiline">
        <div className="column is-half">
          <div className="field">
            <label className="label">Author A</label>
            <div className="control autocomplete">
              <input
                ref={author1InputRef}
                type="text"
                className="input"
                placeholder="Search author A..."
                value={author1}
                onChange={(e) => handleInputChange('author1', e.target.value)}
                onFocus={() => handleInputFocus('author1')}
                onBlur={() => handleInputBlur('author1')}
                disabled={inputsDisabled}
              />
              {author1Autocomplete.length > 0 && (
                <div 
                  className="autocomplete-items"
                  style={{
                    top: autocompletePosition.author1.top || 0,
                    left: autocompletePosition.author1.left || 0,
                    width: autocompletePosition.author1.width || 'auto'
                  }}
                >
                  {author1Autocomplete.map((author, index) => (
                    <div
                      key={index}
                      className="autocomplete-item"
                      onClick={() => selectAuthor(author, 'author1')}
                    >
                      <div className="author-name">{author.display_name}</div>
                      <div className="author-hint">{author.hint || 'Unknown Institution'}</div>
                    </div>
                  ))}
                </div>
              )}
              {author1Data && (
                <div className="author-card">
                  <div className="author-name">{author1Data.display_name}</div>
                  <div className="author-hint">{author1Data.hint || 'Unknown Institution'}</div>
                  <div className="author-id">{author1Data.short_id.split('/')[1]}</div>
                </div>
              )}
              {author1Stats.total > 0 && renderFilterButtons(author1Stats, 'author1')}
              <div className="author-works-container author1-works">
                {renderAuthorWorks(author1Works, 'author1')}
              </div>
            </div>
          </div>
        </div>

        <div className="column is-half">
          <div className="field">
            <label className="label">Author B</label>
            <div className="control autocomplete">
              <input
                ref={author2InputRef}
                type="text"
                className="input"
                placeholder="Search author B..."
                value={author2}
                onChange={(e) => handleInputChange('author2', e.target.value)}
                onFocus={() => handleInputFocus('author2')}
                onBlur={() => handleInputBlur('author2')}
                disabled={inputsDisabled}
              />
              {author2Autocomplete.length > 0 && (
                <div 
                  className="autocomplete-items"
                  style={{
                    top: autocompletePosition.author2.top || 0,
                    left: autocompletePosition.author2.left || 0,
                    width: autocompletePosition.author2.width || 'auto'
                  }}
                >
                  {author2Autocomplete.map((author, index) => (
                    <div
                      key={index}
                      className="autocomplete-item"
                      onClick={() => selectAuthor(author, 'author2')}
                    >
                      <div className="author-name">{author.display_name}</div>
                      <div className="author-hint">{author.hint || 'Unknown Institution'}</div>
                    </div>
                  ))}
                </div>
              )}
              {author2Data && (
                <div className="author-card">
                  <div className="author-name">{author2Data.display_name}</div>
                  <div className="author-hint">{author2Data.hint || 'Unknown Institution'}</div>
                  <div className="author-id">{author2Data.short_id.split('/')[1]}</div>
                </div>
              )}
              {author2Stats.total > 0 && renderFilterButtons(author2Stats, 'author2')}
              <div className="author-works-container author2-works">
                {renderAuthorWorks(author2Works, 'author2')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="overlay">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
}

export default App;
