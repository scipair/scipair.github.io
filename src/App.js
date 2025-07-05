import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import './App.css';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { Network } from 'vis-network';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

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
  const [activeTab, setActiveTab] = useState('comparison');
  const [author1Collaborators, setAuthor1Collaborators] = useState(new Map());
  const [author2Collaborators, setAuthor2Collaborators] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [inputsDisabled, setInputsDisabled] = useState(false);
  const [userTyping, setUserTyping] = useState({ author1: false, author2: false });
  const [autocompletePosition, setAutocompletePosition] = useState({ author1: {}, author2: {} });
  const [isHighlighting, setIsHighlighting] = useState(false);
  
  const debounceTimer = useRef(null);
  const author1InputRef = useRef(null);
  const author2InputRef = useRef(null);
  const networkContainerRef = useRef(null);
  const networkInstanceRef = useRef(null);

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
    const collaboratorsMap = new Map();
    const seenIds = new Set();
    let totalFetched = 0;
    let duplicatesFound = 0;

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

        // eslint-disable-next-line no-loop-func
        works.forEach(work => {
          totalFetched++;
          
          // Skip if we've already seen this work ID
          if (seenIds.has(work.id)) {
            duplicatesFound++;
            return;
          }
          
          // Skip if work has invalid data
          if (!work.id || !work.title) {
            return;
          }
          
          seenIds.add(work.id);
          
          const workData = {
            id: work.id,
            title: work.title?.trim() || 'Untitled',
            publication_year: work.publication_year,
            referenced_works: new Set((work.referenced_works || []).filter(ref => ref && ref.trim())),
            venue: work.primary_location?.source?.display_name?.trim() || 'Unknown Venue',
            url: work.primary_location?.landing_page_url || null,
            citing: false,
            cited: false,
            coauthored: false
          };
          
          worksMap.set(work.id, workData);

          // Extract collaborators from authorships
          if (work.authorships && Array.isArray(work.authorships)) {
            work.authorships.forEach(authorship => {
              if (authorship.author && authorship.author.id && authorship.author.display_name) {
                const collaboratorId = authorship.author.id;
                const collaboratorName = authorship.author.display_name;
                
                // Skip if this is the main author we're analyzing
                if (collaboratorId === `https://openalex.org/${authorId}`) {
                  return;
                }
                
                if (!collaboratorsMap.has(collaboratorId)) {
                  collaboratorsMap.set(collaboratorId, {
                    id: collaboratorId,
                    name: collaboratorName,
                    publication_count: 0,
                    institution: authorship.institutions?.[0]?.display_name || 'Unknown Institution'
                  });
                }
                
                // Increment collaboration count
                const collaborator = collaboratorsMap.get(collaboratorId);
                collaborator.publication_count++;
              }
            });
          }
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Log deduplication stats
      console.log(`Author ${inputId}: Fetched ${totalFetched} works, found ${duplicatesFound} duplicates, keeping ${worksMap.size} unique works`);
      console.log(`Author ${inputId}: Found ${collaboratorsMap.size} unique collaborators`);

      // Sort works by publication year (most recent first)
      const sortedWorks = new Map([...worksMap.entries()].sort((a, b) => {
        const yearA = a[1].publication_year || 0;
        const yearB = b[1].publication_year || 0;
        return yearB - yearA;
      }));

      if (inputId === 'author1') {
        setAuthor1Works(sortedWorks);
        setAuthor1Collaborators(collaboratorsMap);
      } else {
        setAuthor2Works(sortedWorks);
        setAuthor2Collaborators(collaboratorsMap);
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
      
      // Track processed relationships to avoid double counting
      const processedCitations = new Set();
      const processedCollaborations = new Set();

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

      // Apply highlights with deduplication
      newAuthor1Works.forEach((work1, id1) => {
        newAuthor2Works.forEach((work2, id2) => {
          // Check for collaboration (same paper)
          if (id1 === id2) {
            const collabKey = id1;
            if (!processedCollaborations.has(collabKey)) {
              processedCollaborations.add(collabKey);
              author1CoauthoredCount++;
              author2CoauthoredCount++;
              work1.coauthored = true;
              work2.coauthored = true;
            }
            return; // Skip citation checks for collaborations
          }
          
          // Check if work1 cites work2
          if (work1.referenced_works.has(id2)) {
            const citationKey = `${id1}-cites-${id2}`;
            if (!processedCitations.has(citationKey)) {
              processedCitations.add(citationKey);
              author1CitingCount++;
              author2CitedCount++;
              work1.citing = true;
              work2.cited = true;
            }
          }
          
          // Check if work2 cites work1
          if (work2.referenced_works.has(id1)) {
            const citationKey = `${id2}-cites-${id1}`;
            if (!processedCitations.has(citationKey)) {
              processedCitations.add(citationKey);
              author1CitedCount++;
              author2CitingCount++;
              work1.cited = true;
              work2.citing = true;
            }
          }
        });
      });

      console.log(`Highlighting complete: Author1 (${author1CitingCount} citing, ${author1CitedCount} cited, ${author1CoauthoredCount} coauthored) Author2 (${author2CitingCount} citing, ${author2CitedCount} cited, ${author2CoauthoredCount} coauthored)`);

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
      setAuthor1Collaborators(new Map());
    } else {
      setAuthor2Data(null);
      setAuthor2Works(new Map());
      setAuthor2Stats({ citing: 0, cited: 0, coauthored: 0, total: 0 });
      setAuthor2Autocomplete([]);
      setAuthor2Collaborators(new Map());
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

  // Temporal Analytics Functions
  const generatePublicationTrendsData = useCallback(() => {
    if (author1Works.size === 0 || author2Works.size === 0) return null;

    const author1Name = author1Data?.display_name || 'Author A';
    const author2Name = author2Data?.display_name || 'Author B';

    // Get all valid years from both authors (filter out invalid years)
    const allYears = new Set();
    author1Works.forEach(work => {
      const year = work.publication_year;
      if (year && year > 1900 && year <= new Date().getFullYear() + 5) {
        allYears.add(year);
      }
    });
    author2Works.forEach(work => {
      const year = work.publication_year;
      if (year && year > 1900 && year <= new Date().getFullYear() + 5) {
        allYears.add(year);
      }
    });

    const years = Array.from(allYears).sort();
    
    // Count publications per year for each author
    const author1Counts = {};
    const author2Counts = {};
    const collaborationCounts = {};
    const collaborationTracker = new Set(); // Track processed collaborations

    years.forEach(year => {
      author1Counts[year] = 0;
      author2Counts[year] = 0;
      collaborationCounts[year] = 0;
    });

    // Count author1 publications
    author1Works.forEach(work => {
      const year = work.publication_year;
      if (year && years.includes(year)) {
        author1Counts[year]++;
        // Track collaborations by unique work ID to avoid double counting
        if (work.coauthored && !collaborationTracker.has(work.id)) {
          collaborationTracker.add(work.id);
          collaborationCounts[year]++;
        }
      }
    });

    // Count author2 publications (don't double-count collaborations)
    author2Works.forEach(work => {
      const year = work.publication_year;
      if (year && years.includes(year)) {
        author2Counts[year]++;
      }
    });

    return {
      labels: years,
      datasets: [
        {
          label: author1Name,
          data: years.map(year => author1Counts[year]),
          borderColor: 'rgba(74, 144, 226, 0.7)',
          backgroundColor: 'rgba(74, 144, 226, 0.15)',
          fill: true,
          borderWidth: 2,
          pointBackgroundColor: '#4A90E2',
          pointBorderColor: '#4A90E2',
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: author2Name,
          data: years.map(year => author2Counts[year]),
          borderColor: 'rgba(245, 166, 35, 0.7)',
          backgroundColor: 'rgba(245, 166, 35, 0.15)',
          fill: true,
          borderWidth: 2,
          pointBackgroundColor: '#F5A623',
          pointBorderColor: '#F5A623',
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: 'Collaborations',
          data: years.map(year => collaborationCounts[year]),
          borderColor: 'rgba(155, 89, 182, 0.7)',
          backgroundColor: 'rgba(155, 89, 182, 0.15)',
          fill: true,
          borderWidth: 2,
          pointBackgroundColor: '#9B59B6',
          pointBorderColor: '#9B59B6',
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    };
  }, [author1Works, author2Works, author1Data, author2Data]);

  const generateTimelineData = useCallback(() => {
    if (author1Works.size === 0 || author2Works.size === 0) return null;

    // Get all valid years
    const allYears = new Set();
    author1Works.forEach(work => {
      const year = work.publication_year;
      if (year && year > 1900 && year <= new Date().getFullYear() + 5) {
        allYears.add(year);
      }
    });
    author2Works.forEach(work => {
      const year = work.publication_year;
      if (year && year > 1900 && year <= new Date().getFullYear() + 5) {
        allYears.add(year);
      }
    });

    const years = Array.from(allYears).sort();
    
    // Count different types of papers per year with deduplication
    const citingData = [];
    const citedData = [];
    const coauthoredData = [];

    years.forEach(year => {
      let citing = 0;
      let cited = 0;
      let coauthored = 0;
      
      const processedWorks = new Set(); // Track processed works for this year

      // Count from author1 works
      author1Works.forEach(work => {
        if (work.publication_year === year && !processedWorks.has(work.id)) {
          if (work.citing) citing++;
          if (work.cited) cited++;
          if (work.coauthored) {
            coauthored++;
            processedWorks.add(work.id); // Mark collaboration as processed
          }
        }
      });

      // Count from author2 works (avoid double-counting collaborations)
      author2Works.forEach(work => {
        if (work.publication_year === year && !processedWorks.has(work.id)) {
          if (work.citing) citing++;
          if (work.cited) cited++;
          // Don't count coauthored again - already counted from author1
        }
      });

      citingData.push(citing);
      citedData.push(cited);
      coauthoredData.push(coauthored);
    });

    return {
      labels: years,
      datasets: [
        {
          label: 'Cross-Citations',
          data: citingData,
          backgroundColor: '#7FB3D3',
          borderColor: '#4A90E2',
          borderWidth: 2,
        },
        {
          label: 'Cited by Each Other',
          data: citedData,
          backgroundColor: '#FFB347',
          borderColor: '#F5A623',
          borderWidth: 2,
        },
        {
          label: 'Collaborations',
          data: coauthoredData,
          backgroundColor: '#DDA0DD',
          borderColor: '#9B59B6',
          borderWidth: 2,
        },
      ],
    };
  }, [author1Works, author2Works]);

  // Network Building Function
  const buildNetworkData = useCallback(() => {
    if (author1Collaborators.size === 0 && author2Collaborators.size === 0) return null;

    const nodes = [];
    const edges = [];
    
    // Add the two main authors as central nodes
    if (author1Data) {
      nodes.push({
        id: author1Data.short_id,
        label: author1Data.display_name,
        color: {
          background: '#4A90E2',
          border: '#2980B9',
          highlight: {
            background: '#5BA0F2',
            border: '#2980B9'
          }
        },
        size: 40,
        group: 'author1',
        title: `${author1Data.display_name}<br/>${author1Data.hint || 'Unknown Institution'}<br/>Publications: ${author1Works.size}`,
        font: { size: 16, color: '#000000' }
      });
    }
    
    if (author2Data) {
      nodes.push({
        id: author2Data.short_id,
        label: author2Data.display_name,
        color: {
          background: '#F5A623',
          border: '#E67E22',
          highlight: {
            background: '#F39C12',
            border: '#E67E22'
          }
        },
        size: 40,
        group: 'author2',
        title: `${author2Data.display_name}<br/>${author2Data.hint || 'Unknown Institution'}<br/>Publications: ${author2Works.size}`,
        font: { size: 16, color: '#000000' }
      });
    }

    // Track all collaborators to avoid duplicates
    const allCollaborators = new Map();
    
    // Add author1's collaborators
    author1Collaborators.forEach((collaborator, id) => {
      if (!allCollaborators.has(id)) {
        allCollaborators.set(id, {
          ...collaborator,
          connectedTo: ['author1'],
          totalCollaborations: collaborator.publication_count
        });
      }
    });
    
    // Add author2's collaborators and mark shared ones
    author2Collaborators.forEach((collaborator, id) => {
      if (allCollaborators.has(id)) {
        // This is a shared collaborator
        const existing = allCollaborators.get(id);
        existing.connectedTo.push('author2');
        existing.totalCollaborations += collaborator.publication_count;
        existing.isShared = true;
      } else {
        allCollaborators.set(id, {
          ...collaborator,
          connectedTo: ['author2'],
          totalCollaborations: collaborator.publication_count
        });
      }
    });

    // Add collaborator nodes (limit to top 20 per author to avoid clutter)
    const author1TopCollaborators = Array.from(author1Collaborators.entries())
      .sort((a, b) => b[1].publication_count - a[1].publication_count)
      .slice(0, 20);
    
    const author2TopCollaborators = Array.from(author2Collaborators.entries())
      .sort((a, b) => b[1].publication_count - a[1].publication_count)
      .slice(0, 20);

    const addedCollaborators = new Set();

    // Add author1's top collaborators
    author1TopCollaborators.forEach(([id, collaborator]) => {
      if (!addedCollaborators.has(id)) {
        const nodeSize = Math.max(10, Math.min(30, collaborator.publication_count * 2));
        const isShared = author2Collaborators.has(id);
        
        nodes.push({
          id: id,
          label: collaborator.name,
          color: {
            background: isShared ? '#9B59B6' : '#7FB3D3',
            border: isShared ? '#8E44AD' : '#3498DB',
            highlight: {
              background: isShared ? '#AF6BD8' : '#85C1E9',
              border: isShared ? '#8E44AD' : '#3498DB'
            }
          },
          size: nodeSize,
          group: isShared ? 'shared' : 'author1_collab',
          title: `${collaborator.name}<br/>${collaborator.institution}<br/>Collaborations: ${collaborator.publication_count}${isShared ? ' (Shared collaborator)' : ''}`,
          font: { size: 12, color: '#000000' }
        });
        
        addedCollaborators.add(id);
      }
    });

    // Add author2's top collaborators (skip if already added)
    author2TopCollaborators.forEach(([id, collaborator]) => {
      if (!addedCollaborators.has(id)) {
        const nodeSize = Math.max(10, Math.min(30, collaborator.publication_count * 2));
        
        nodes.push({
          id: id,
          label: collaborator.name,
          color: {
            background: '#FFB347',
            border: '#E67E22',
            highlight: {
              background: '#F39C12',
              border: '#E67E22'
            }
          },
          size: nodeSize,
          group: 'author2_collab',
          title: `${collaborator.name}<br/>${collaborator.institution}<br/>Collaborations: ${collaborator.publication_count}`,
          font: { size: 12, color: '#000000' }
        });
        
        addedCollaborators.add(id);
      }
    });

    // Add edges between authors and their collaborators
    author1TopCollaborators.forEach(([id, collaborator]) => {
      if (author1Data) {
        const edgeWidth = Math.max(1, Math.min(8, collaborator.publication_count));
        edges.push({
          from: author1Data.short_id,
          to: id,
          width: edgeWidth,
          color: {
            color: '#4A90E2',
            opacity: 0.8
          },
          smooth: { type: 'continuous' }
        });
      }
    });

    author2TopCollaborators.forEach(([id, collaborator]) => {
      if (author2Data) {
        const edgeWidth = Math.max(1, Math.min(8, collaborator.publication_count));
        edges.push({
          from: author2Data.short_id,
          to: id,
          width: edgeWidth,
          color: {
            color: '#F5A623',
            opacity: 0.8
          },
          smooth: { type: 'continuous' }
        });
      }
    });

    // Add edge between the two main authors if they have collaborations
    if (author1Data && author2Data && author1Stats.coauthored > 0) {
      edges.push({
        from: author1Data.short_id,
        to: author2Data.short_id,
        width: Math.max(2, Math.min(10, author1Stats.coauthored * 2)),
        color: {
          color: '#9B59B6',
          opacity: 0.9
        },
        label: `${author1Stats.coauthored} collab${author1Stats.coauthored > 1 ? 's' : ''}`,
        font: { size: 12, color: '#000000' }
      });
    }

    return { nodes, edges };
  }, [author1Data, author2Data, author1Collaborators, author2Collaborators, author1Works.size, author2Works.size, author1Stats]);

  const publicationTrendsData = generatePublicationTrendsData();
  const timelineData = generateTimelineData();
  
  // Generate network data using useMemo to prevent unnecessary recalculations
  const networkVisualizationData = useMemo(() => {
    return buildNetworkData();
  }, [buildNetworkData]);

  // Network visualization effect
  useEffect(() => {
    if (activeTab === 'network' && networkVisualizationData && networkContainerRef.current) {
      const { nodes, edges } = networkVisualizationData;
      
      console.log('Initializing network with', nodes.length, 'nodes and', edges.length, 'edges');
      
      const data = {
        nodes: nodes,
        edges: edges
      };
      
      const options = {
        layout: {
          improvedLayout: true,
          hierarchical: false
        },
        physics: {
          enabled: true,
          solver: 'forceAtlas2Based',
          forceAtlas2Based: {
            gravitationalConstant: -26,
            centralGravity: 0.005,
            springLength: 230,
            springConstant: 0.18,
            damping: 0.15
          },
          stabilization: {
            iterations: 150
          }
        },
        nodes: {
          borderWidth: 2,
          borderWidthSelected: 3,
          font: {
            size: 14,
            color: '#000000'
          },
          shape: 'dot'
        },
        edges: {
          color: {
            opacity: 0.8
          },
          smooth: {
            enabled: true,
            type: 'continuous',
            roundness: 0.5
          }
        },
        interaction: {
          hover: true,
          tooltipDelay: 200,
          hideEdgesOnDrag: true,
          hideEdgesOnZoom: true
        }
      };

      try {
        // Clear any existing network
        if (networkInstanceRef.current) {
          networkInstanceRef.current.destroy();
          networkInstanceRef.current = null;
        }
        
        const network = new Network(networkContainerRef.current, data, options);
        
        // Store network instance in ref
        networkInstanceRef.current = network;
        
        // Set up event listeners
        network.on('stabilizationProgress', function(params) {
          console.log('Network stabilization progress:', Math.round(params.iterations/params.total * 100) + '%');
        });
        
        network.on('stabilizationIterationsDone', function() {
          console.log('Network stabilization complete');
        });
        
        console.log('Network initialized successfully');
        
        return () => {
          if (networkInstanceRef.current) {
            networkInstanceRef.current.destroy();
            networkInstanceRef.current = null;
          }
        };
      } catch (error) {
        console.error('Error initializing network:', error);
      }
    }
  }, [activeTab, networkVisualizationData]);

  // Cleanup network on unmount
  useEffect(() => {
    return () => {
      if (networkInstanceRef.current) {
        networkInstanceRef.current.destroy();
        networkInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="App">
      <div className="title">SciPair</div>
      <div className="description">
        A tool to explore relationships between authors using data from OpenAlex. Compare authors, visualize coauthorships and citations. Created by&nbsp;
        <a href="https://singhdan.me" target="_blank" rel="noopener noreferrer">Danishjeet Singh</a> and <a href="https://filipinascimento.github.io" target="_blank" rel="noopener noreferrer">Filipi N. Silva</a>.
        <br />
        <a href="https://github.com/scipair/scipair" target="_blank" rel="noopener noreferrer">GitHub Repository</a>
      </div>
      
      {/* Data Accuracy Notice */}
      <div className="data-notice">
        <div className="notice-content">
          <span className="notice-icon">⚠️</span>
          <div className="notice-text">
            <strong>Data Accuracy Note:</strong> Numbers may not be fully accurate as OpenAlex sometimes registers different versions of the same paper, dataset, or preprint as separate publications. We apply deduplication techniques to minimize this issue, but some variations may persist.
          </div>
        </div>
      </div>
      
      {/* Tab Navigation */}
      <div className="tabs">
        <ul>
          <li className={activeTab === 'comparison' ? 'is-active' : ''}>
            <button onClick={() => setActiveTab('comparison')}>
              Comparison
            </button>
          </li>
          <li className={activeTab === 'analytics' ? 'is-active' : ''}>
            <button onClick={() => setActiveTab('analytics')}>
              Analytics
            </button>
          </li>
          <li className={activeTab === 'network' ? 'is-active' : ''}>
            <button onClick={() => setActiveTab('network')}>
              Network
            </button>
          </li>
        </ul>
      </div>

      {/* Comparison Tab */}
      {activeTab === 'comparison' && (
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
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="analytics-container">
          {author1Data && author2Data && author1Works.size > 0 && author2Works.size > 0 ? (
            <>
              <div className="analytics-section">
                <h3 className="analytics-title">Publication Trends Over Time</h3>
                <div className="chart-explanation">
                  <p><strong>📈 What this shows:</strong> The publication activity of both authors across their careers, with special highlighting of years when they collaborated.</p>
                  <div className="explanation-items">
                    <div className="explanation-item">
                      <span className="legend-color" style={{backgroundColor: '#4A90E2'}}></span>
                      <strong>Blue Line:</strong> {author1Data?.display_name || 'Author A'}'s publications per year
                    </div>
                    <div className="explanation-item">
                      <span className="legend-color" style={{backgroundColor: '#F5A623'}}></span>
                      <strong>Orange Line:</strong> {author2Data?.display_name || 'Author B'}'s publications per year
                    </div>
                    <div className="explanation-item">
                      <span className="legend-color" style={{backgroundColor: '#9B59B6'}}></span>
                      <strong>Purple Line:</strong> Years when they collaborated on papers together
                    </div>
                  </div>
                </div>
                <div className="chart-container">
                  {publicationTrendsData && (
                    <Line
                      data={publicationTrendsData}
                      options={{
                        responsive: true,
                        plugins: {
                          title: {
                            display: true,
                            text: 'Publications per Year',
                            font: {
                              size: 16,
                              weight: 'bold',
                            },
                          },
                          legend: {
                            position: 'top',
                            labels: {
                              font: {
                                size: 14,
                              },
                            },
                          },
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            title: {
                              display: true,
                              text: 'Number of Publications',
                              font: {
                                size: 14,
                                weight: 'bold',
                              },
                            },
                          },
                          x: {
                            title: {
                              display: true,
                              text: 'Year',
                              font: {
                                size: 14,
                                weight: 'bold',
                              },
                            },
                          },
                        },
                      }}
                    />
                  )}
                </div>
              </div>

              <div className="analytics-section">
                <h3 className="analytics-title">Relationship Timeline</h3>
                <div className="chart-explanation">
                  <p><strong>🔗 What this shows:</strong> The specific academic relationships between the two authors over time, broken down by type of interaction.</p>
                  <div className="explanation-items">
                    <div className="explanation-item">
                      <span className="legend-color" style={{backgroundColor: '#7FB3D3'}}></span>
                      <strong>Light Blue Bars:</strong> Papers where one author cites the other's work
                    </div>
                    <div className="explanation-item">
                      <span className="legend-color" style={{backgroundColor: '#FFB347'}}></span>
                      <strong>Peach Bars:</strong> Papers where they cite each other's work
                    </div>
                    <div className="explanation-item">
                      <span className="legend-color" style={{backgroundColor: '#DDA0DD'}}></span>
                      <strong>Lavender Bars:</strong> Papers where they worked together as co-authors
                    </div>
                  </div>
                  <p className="chart-note">💡 <em>Higher bars indicate more academic interaction in that year. Multiple relationships can occur in the same year.</em></p>
                </div>
                <div className="chart-container">
                  {timelineData && (
                    <Bar
                      data={timelineData}
                      options={{
                        responsive: true,
                        plugins: {
                          title: {
                            display: true,
                            text: 'Citations and Collaborations by Year',
                            font: {
                              size: 16,
                              weight: 'bold',
                            },
                          },
                          legend: {
                            position: 'top',
                            labels: {
                              font: {
                                size: 14,
                              },
                            },
                          },
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            title: {
                              display: true,
                              text: 'Number of Papers',
                              font: {
                                size: 14,
                                weight: 'bold',
                              },
                            },
                          },
                          x: {
                            title: {
                              display: true,
                              text: 'Year',
                              font: {
                                size: 14,
                                weight: 'bold',
                              },
                            },
                          },
                        },
                      }}
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="analytics-placeholder">
              <h3>📊 Temporal Analytics</h3>
              <p>Load two authors in the Comparison tab to see their publication trends and collaboration timeline.</p>
            </div>
          )}
        </div>
      )}

      {/* Network Tab */}
      {activeTab === 'network' && (
        <div className="network-container">
          {author1Data && author2Data && (author1Collaborators.size > 0 || author2Collaborators.size > 0) ? (
            <>
              <div className="network-section">
                <h3 className="network-title">Collaboration Network</h3>
                <div className="network-explanation">
                  <p><strong>🌐 What this shows:</strong> The collaborative network of both authors, showing their most frequent collaborators and research connections.</p>
                  <div className="explanation-items">
                    <div className="explanation-item">
                      <span className="legend-color" style={{backgroundColor: '#4A90E2'}}></span>
                      <strong>Blue:</strong> {author1Data?.display_name || 'Author A'} and their collaborators
                    </div>
                    <div className="explanation-item">
                      <span className="legend-color" style={{backgroundColor: '#F5A623'}}></span>
                      <strong>Orange:</strong> {author2Data?.display_name || 'Author B'} and their collaborators
                    </div>
                    <div className="explanation-item">
                      <span className="legend-color" style={{backgroundColor: '#9B59B6'}}></span>
                      <strong>Purple:</strong> Shared collaborators or direct collaboration
                    </div>
                  </div>
                  <p className="network-note">💡 <em>Node size represents number of collaborations. Edge thickness shows collaboration strength. Hover over nodes for details.</em></p>
                </div>
                                 <div className="network-visualization">
                   <div 
                     ref={networkContainerRef} 
                     style={{ 
                       width: '100%', 
                       height: '600px',
                       border: '1px solid #ddd',
                       borderRadius: '8px',
                       backgroundColor: '#fafafa'
                     }}
                   ></div>
                 </div>
              </div>
            </>
          ) : (
            <div className="network-placeholder">
              <h3>🌐 Collaboration Network</h3>
              <p>Load two authors in the Comparison tab to see their collaboration network and research connections.</p>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="overlay">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
}

export default App;
