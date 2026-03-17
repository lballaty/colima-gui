import { useState, useEffect, useRef } from 'react';
import './App.css';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { getCurrent } from '@tauri-apps/api/window';
import { Button, Checkbox, FormControlLabel, Typography, Container, Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Select, MenuItem, FormControl, InputLabel } from '@mui/material';

interface ColimaProfile {
  name: string;
  status: string;
  arch: string;
  cpus: string;
  memory: string;
  disk: string;
  runtime?: string;
  address?: string;
}

function App() {
  const [output, setOutput] = useState<string[]>([]);
  const [debug, setDebug] = useState(false);
  const [profiles, setProfiles] = useState<ColimaProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = listen<string>('command-output', (event) => {
      console.log('Received event:', event.payload); // Debugging print
      setOutput((prevOutput) => [...prevOutput, event.payload]);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  // Fetch profiles on mount and refresh every 5 seconds
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const result = await invoke<ColimaProfile[]>('list_profiles');
        setProfiles(result);
      } catch (error) {
        console.error('Failed to fetch profiles:', error);
      }
    };

    fetchProfiles();
    const interval = setInterval(fetchProfiles, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = async (command: string, label?: string) => {
    if (!selectedProfile) {
      alert('Please select a profile first');
      return;
    }

    try {
      setOutput((prevOutput) => [...prevOutput, `$ ${label || command}`]); // Add command to output
      const currentWindow = await getCurrent();

      // Commands that need profile parameter
      if (['start_colima', 'stop_colima', 'restart_colima', 'status_colima', 'delete_colima'].includes(command)) {
        await invoke(command, { window: currentWindow, profile: selectedProfile, debug });
      } else if (command === 'open_config') {
        await invoke(command, { profile: selectedProfile });
      } else {
        // Commands that don't need profile (list_colima, prune_colima, version_colima)
        await invoke(command, { window: currentWindow, debug });
      }
    } catch (error) {
      alert('Error: ' + error);
    }
  };

  const formatOutput = (line: string) => {
    if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fatal')) {
      return <span style={{ color: 'red' }}>{line}</span>;
    } else if (line.toLowerCase().includes('warn')) {
      return <span style={{ color: 'yellow' }}>{line}</span>;
    }
    return <span>{line}</span>;
  };

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>
        Colima GUI
      </Typography>

      {/* Profiles Table */}
      <Box mb={3}>
        <Typography variant="h6" gutterBottom>
          Colima Profiles
        </Typography>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Profile</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Arch</strong></TableCell>
                <TableCell><strong>CPUs</strong></TableCell>
                <TableCell><strong>Memory</strong></TableCell>
                <TableCell><strong>Disk</strong></TableCell>
                <TableCell><strong>Runtime</strong></TableCell>
                <TableCell><strong>Address</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">No profiles found</TableCell>
                </TableRow>
              ) : (
                profiles.map((profile) => (
                  <TableRow key={profile.name}>
                    <TableCell>{profile.name}</TableCell>
                    <TableCell>
                      <span style={{ color: profile.status === 'Running' ? 'green' : 'gray' }}>
                        {profile.status}
                      </span>
                    </TableCell>
                    <TableCell>{profile.arch}</TableCell>
                    <TableCell>{profile.cpus}</TableCell>
                    <TableCell>{profile.memory}</TableCell>
                    <TableCell>{profile.disk}</TableCell>
                    <TableCell>{profile.runtime || '-'}</TableCell>
                    <TableCell>{profile.address || '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Profile Selection */}
      <Box mb={3}>
        <FormControl fullWidth>
          <InputLabel id="profile-select-label">Select Profile to Manage</InputLabel>
          <Select
            labelId="profile-select-label"
            value={selectedProfile}
            label="Select Profile to Manage"
            onChange={(e) => setSelectedProfile(e.target.value)}
          >
            {profiles.map((profile) => (
              <MenuItem key={profile.name} value={profile.name}>
                {profile.name} ({profile.status})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box display="flex" justifyContent="space-between">
        <Box display="flex" flexDirection="column" gap={2}>
          <Button
            variant="contained"
            onClick={() => handleClick('start_colima', `colima start ${selectedProfile}`)}
            disabled={!selectedProfile}
          >
            Start Selected Profile
          </Button>
          <Button
            variant="contained"
            onClick={() => handleClick('stop_colima', `colima stop ${selectedProfile}`)}
            disabled={!selectedProfile}
          >
            Stop Selected Profile
          </Button>
          <Button
            variant="contained"
            onClick={() => handleClick('restart_colima', `colima restart ${selectedProfile}`)}
            disabled={!selectedProfile}
          >
            Restart Selected Profile
          </Button>
          <Button
            variant="contained"
            onClick={() => handleClick('status_colima', `colima status ${selectedProfile}`)}
            disabled={!selectedProfile}
          >
            Check Status
          </Button>
          <Button
            variant="contained"
            onClick={() => handleClick('open_config', `open ~/.colima/${selectedProfile}/colima.yaml`)}
            disabled={!selectedProfile}
          >
            Edit Config
          </Button>
          <Button
            variant="contained"
            onClick={() => handleClick('delete_colima', `colima delete ${selectedProfile}`)}
            disabled={!selectedProfile}
          >
            Delete Selected Profile
          </Button>
          <Button variant="contained" onClick={() => handleClick('list_colima', 'colima list')}>List All Instances</Button>
          <Button variant="contained" onClick={() => handleClick('prune_colima', 'colima prune -f')}>Prune Assets</Button>
          <Button variant="contained" onClick={() => handleClick('version_colima', 'colima version')}>Version</Button>
          <FormControlLabel
            control={
              <Checkbox
                checked={debug}
                onChange={(e) => setDebug(e.target.checked)}
              />
            }
            label="Debug Mode"
          />
        </Box>
        <Paper elevation={3} style={{ padding: '10px', backgroundColor: 'black', color: 'white', height: '400px', overflowY: 'auto', width: '100%' }} ref={terminalRef}>
          {output.map((line, index) => (
            <div key={index}>{formatOutput(line)}</div>
          ))}
        </Paper>
      </Box>
    </Container>
  );
}

export default App;
